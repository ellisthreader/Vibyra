use crate::account_api;
use crate::agent_computer_store;
use crate::commands::run_blocking;
use crate::secret_store::SecretStore;
use crate::state::AppState;
use serde_json::Value;
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn agent_computer_revoke(app: AppHandle, id: String) -> Result<(), String> {
    if !looks_uuid(&id) {
        return Err("Unknown computer grant.".into());
    }
    let state = app.state::<AppState>();
    let token = state
        .account
        .token()
        .ok_or("Sign in to remove computer access.")?;
    let scope = account_scope(&state)?;
    let saved_app = app.clone();
    let local_id = id.clone();
    run_blocking(move || {
        let state = saved_app.state::<AppState>();
        let _guard = state.agent_computer_write.lock();
        let file = agent_computer_store::path(&state.settings_path)?;
        let mut grants = agent_computer_store::load(&file)?;
        for grant in &mut grants {
            if grant.id == local_id && grant.account_scope == scope {
                grant.revoked = true;
            }
        }
        agent_computer_store::save(&file, &grants)?;
        let _ = SecretStore.write_agent_runner_key(&local_id, None);
        Ok(())
    })
    .await?;
    revoke_cloud(&token, &Value::String(id.clone())).await?;
    let saved_app = app.clone();
    run_blocking(move || {
        let state = saved_app.state::<AppState>();
        let _guard = state.agent_computer_write.lock();
        let file = agent_computer_store::path(&state.settings_path)?;
        let mut grants = agent_computer_store::load(&file)?;
        grants.retain(|grant| grant.id != id);
        agent_computer_store::save(&file, &grants)
    })
    .await
}

pub fn account_scope(state: &AppState) -> Result<String, String> {
    state
        .account
        .snapshot()
        .profile
        .map(|profile| profile.welcome_key)
        .filter(|scope| !scope.is_empty())
        .ok_or("Sign in to use Agent Computer.".into())
}

pub fn looks_uuid(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}

pub async fn revoke_cloud(token: &str, id: &Value) -> Result<(), String> {
    let id = id
        .as_str()
        .filter(|id| looks_uuid(id))
        .ok_or("Unknown computer grant")?;
    let response = crate::http_client::shared()
        .delete(format!(
            "{}/api/agents/v1/workspaces/{id}",
            account_api::base_url()
        ))
        .bearer_auth(token)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| {
            "Local access is off. Cloud removal will need a retry when connected.".to_string()
        })?;
    if response.status().is_success() || response.status().as_u16() == 404 {
        Ok(())
    } else {
        Err("Local access is off. Cloud removal will need a retry.".into())
    }
}
