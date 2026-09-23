use crate::agent_computer_access::looks_uuid;
use crate::agent_computer_runner_auth::still_granted;
use crate::agent_computer_store::{self, Grant};
use crate::agent_computer_tools;
use crate::agent_computer_transport;
use crate::secret_store::SecretStore;
use crate::state::AppState;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const POLL: Duration = Duration::from_secs(5);

#[path = "agent_computer_runner_execute.rs"]
mod execute;
use execute::execute_tool;

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut engines: HashMap<String, Arc<vibyra_engine::Engine>> = HashMap::new();
        loop {
            tick(&app, &mut engines).await;
            tokio::time::sleep(POLL).await;
        }
    });
}

async fn tick(app: &AppHandle, engines: &mut HashMap<String, Arc<vibyra_engine::Engine>>) {
    let state = app.state::<AppState>();
    let Some(token) = state.account.token() else {
        engines.clear();
        return;
    };
    let Some(scope) = state
        .account
        .snapshot()
        .profile
        .map(|profile| profile.welcome_key)
    else {
        engines.clear();
        return;
    };
    let Ok(store) = agent_computer_store::path(&state.settings_path) else {
        engines.clear();
        return;
    };
    let Some(parent) = state.settings_path.parent() else {
        engines.clear();
        return;
    };
    let identity_dir = parent.join("phone");
    let engine_dir = parent.join("agent-computer-engine");
    let Ok(ready) = tauri::async_runtime::spawn_blocking(move || {
        let grants = agent_computer_store::load(&store)?;
        let host = vibyra_host::host_identity_id(&identity_dir)?;
        Ok::<_, String>((grants, host))
    })
    .await
    else {
        engines.clear();
        return;
    };
    let Ok((grants, host)) = ready else {
        engines.clear();
        return;
    };
    let active: Vec<_> = grants
        .into_iter()
        .filter(|g| {
            !g.revoked
                && (!g.can_write || g.source_path.is_some())
                && g.account_scope == scope
                && g.host_id == host
        })
        .collect();
    engines.retain(|id, _| active.iter().any(|grant| grant.id == *id));
    for grant in active {
        if app.state::<AppState>().account.token().as_deref() != Some(token.as_str()) {
            return;
        }
        poll_grant(app, &token, &grant, engine_dir.clone(), engines).await;
    }
}

async fn poll_grant(
    app: &AppHandle,
    token: &str,
    grant: &Grant,
    engine_dir: PathBuf,
    engines: &mut HashMap<String, Arc<vibyra_engine::Engine>>,
) {
    let id = grant.id.clone();
    let Ok(Ok(Some(key))) =
        tauri::async_runtime::spawn_blocking(move || SecretStore.read_agent_runner_key(&id)).await
    else {
        return;
    };
    let Ok(tools) = agent_computer_transport::pending(token, &key, &grant.id).await else {
        return;
    };
    if tools.is_empty() {
        return;
    }
    let engine = if let Some(engine) = engines.get(&grant.id) {
        engine.clone()
    } else {
        let local = grant.clone();
        let Ok(Ok(engine)) = tauri::async_runtime::spawn_blocking(move || {
            agent_computer_tools::open(&local, &engine_dir)
        })
        .await
        else {
            return;
        };
        let engine = Arc::new(engine);
        engines.insert(grant.id.clone(), engine.clone());
        engine
    };
    for tool in &tools {
        let Some(tool_id) = tool["id"].as_str().filter(|id| looks_uuid(id)) else {
            continue;
        };
        let Some(operation) = tool["operation"].as_str().filter(|name| {
            matches!(
                *name,
                "list_files"
                    | "read_file"
                    | "search_files"
                    | "git_status"
                    | "git_diff"
                    | "write_file"
            )
        }) else {
            continue;
        };
        if !still_granted(app, token, grant).await {
            return;
        }
        if operation == "write_file" {
            let Some(fingerprint) = tool["approval"]["fingerprint"].as_str() else {
                continue;
            };
            if agent_computer_transport::claim(token, &key, &grant.id, tool_id, fingerprint)
                .await
                .is_err()
            {
                return;
            }
        }
        let local = grant.clone();
        let mut request = tool.clone();
        if operation == "write_file" {
            request["approval"]["state"] = json!("dispatching");
        }
        let app_for_tool = app.clone();
        let current_token = token.to_owned();
        let current_key = key.clone();
        let engine = engine.clone();
        let Ok(result) = tauri::async_runtime::spawn_blocking(move || {
            execute_tool(
                &app_for_tool,
                &current_token,
                &current_key,
                &local,
                &engine,
                &request,
            )
        })
        .await
        else {
            return;
        };
        if !still_granted(app, token, grant).await {
            return;
        }
        let _ = agent_computer_transport::result(token, &key, &grant.id, tool_id, result).await;
    }
}
