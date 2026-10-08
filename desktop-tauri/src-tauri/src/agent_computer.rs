#[path = "agent_computer_breadth.rs"]
mod breadth;
#[path = "agent_computer_choose_store.rs"]
mod persistence;
use crate::agent_computer_access::{account_scope, looks_uuid, revoke_cloud};
use crate::agent_computer_store::{self, Grant};
use crate::commands::run_blocking;
use crate::{account_api, state::AppState};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn agent_computer_choose(
    app: AppHandle,
    agent_id: String,
    allow_edits: bool,
    // Sent by frontends that know the isolated shell-test VM; this build has none.
    allow_tests: Option<bool>,
    confirm_broad: Option<bool>,
) -> Result<Value, String> {
    if !looks_uuid(&agent_id) {
        return Err("Choose a valid teammate.".into());
    }
    if allow_tests == Some(true) {
        return Err("Shell tests are not available in this version of Vibyra.".into());
    }
    let state = app.state::<AppState>();
    let token = state
        .account
        .token()
        .ok_or("Sign in to give a teammate computer access.")?;
    let scope = account_scope(&state)?;
    let (selected, confirmed) =
        breadth::pick(&app, &agent_id, allow_edits, confirm_broad.unwrap_or(false)).await?;
    let Some(selected) = selected else {
        return Ok(json!({"cancelled":true}));
    };
    // A broad folder (home, a root, Desktop...) is only ever granted read-only, after a confirmation.
    let allow_edits = allow_edits && !confirmed;
    let (path, gate) = run_blocking(move || {
        let path = selected.canonicalize().map_err(|e| e.to_string())?;
        if !path.is_dir() {
            return Err("Choose a project folder.".into());
        }
        let gate = breadth::gate_here(&path, confirmed);
        Ok((path, gate))
    })
    .await?;
    if let breadth::Gate::Ask(kind) = gate {
        return Ok(breadth::ask(&agent_id, &path, kind));
    }
    let folder = path.clone();
    // The directory object the person picked, captured before anything else touches it.
    let (git_edit, selected_identity) = run_blocking(move || {
        let selected_identity = agent_computer_store::capture_folder(&folder)?;
        let git_edit = if allow_edits {
            vibyra_core::workspace_agent::classify_edit_source(&folder)
                .map_err(|error| error.to_string())?
        } else {
            false
        };
        Ok((git_edit, selected_identity))
    })
    .await?;
    let label = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Project")
        .chars()
        .take(80)
        .collect::<String>();
    let identity_dir = state
        .settings_path
        .parent()
        .ok_or("No Vibyra settings directory")?
        .join("phone");
    let host_id = run_blocking(move || {
        vibyra_host::host_identity_id_with_key_store(
            &identity_dir,
            &crate::secret_store::SecretStore,
        )
    })
    .await?;
    let response = crate::http_client::shared()
        .post(format!(
            "{}/api/agents/v1/workspaces",
            account_api::base_url()
        ))
        .bearer_auth(&token)
        .json(&json!({"agentId":agent_id,"hostId":host_id,"label":label,
            "canWrite":allow_edits,"platform":std::env::consts::OS}))
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| {
            "Connection interrupted. Check this teammate's computer access before retrying."
                .to_string()
        })?;
    let status = response.status().as_u16();
    let value: Value = response
        .json()
        .await
        .map_err(|_| "The service returned an unreadable response.".to_string())?;
    if !(200..300).contains(&status) {
        return Err(account_api::error_detail(&value, status));
    }
    if state.account.token().as_deref() != Some(&token) || account_scope(&state)? != scope {
        return Err("Your account changed. Check the computer grant before retrying.".into());
    }
    let data = &value["workspace"];
    if data["canWrite"].as_bool() != Some(allow_edits) {
        return Err("The service returned a different computer access level.".into());
    }
    let id = data["id"]
        .as_str()
        .filter(|id| looks_uuid(id))
        .ok_or("Missing workspace identity")?
        .to_owned();
    let key = data["runnerKey"]
        .as_str()
        .filter(|key| key.len() == 64)
        .ok_or("Missing runner key")?
        .to_owned();
    let source_path = allow_edits.then(|| path.clone());
    let worktree = if git_edit {
        let source = path.clone();
        let storage = state
            .settings_path
            .parent()
            .ok_or("No Vibyra settings directory")?
            .join("agent-computer-worktrees");
        let worktree_id = id.clone();
        match run_blocking(move || {
            vibyra_core::workspace_agent::prepare(&source, &storage, &worktree_id)
                .map_err(|error| error.to_string())
        })
        .await
        {
            Ok(worktree) => Some(worktree),
            Err(error) => {
                let _ = revoke_cloud(&token, &value["workspace"]["id"]).await;
                return Err(error);
            }
        }
    } else {
        None
    };
    let grant = Grant {
        id: id.clone(),
        agent_id,
        host_id,
        account_scope: scope,
        label,
        path: worktree.unwrap_or(path),
        source_path,
        path_identity: None,
        source_identity: None,
        can_write: allow_edits,
        revoked: false,
    };
    // Bind the folder objects now; a folder swapped since the picker is refused, and the
    // cloud grant created above is removed again.
    let grant = match run_blocking(move || grant.bind_selected_identity(selected_identity)).await {
        Ok(grant) => grant,
        Err(error) => {
            let _ = revoke_cloud(&token, &value["workspace"]["id"]).await;
            return Err(error);
        }
    };
    let stored = persistence::save(app.clone(), token.clone(), grant, id, key).await;
    if stored.is_err() {
        let _ = revoke_cloud(&token, &value["workspace"]["id"]).await;
    }
    stored
}
