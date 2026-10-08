use crate::agent_computer_store::{self, Grant};
use crate::secret_store::SecretStore;
use crate::state::AppState;
use tauri::{AppHandle, Manager};

pub fn authorized(app: &AppHandle, token: &str, key: &str, grant: &Grant) -> bool {
    let state = app.state::<AppState>();
    if state.account.token().as_deref() != Some(token)
        || state
            .account
            .snapshot()
            .profile
            .is_none_or(|profile| profile.welcome_key != grant.account_scope)
    {
        return false;
    }
    agent_computer_store::path(&state.settings_path)
        .ok()
        .and_then(|file| agent_computer_store::load(&file).ok())
        .is_some_and(|grants| {
            grant.validate_path().is_ok()
                && grants.iter().any(|saved| !saved.revoked && saved == grant)
        })
        && SecretStore
            .read_agent_runner_key(&grant.id)
            .ok()
            .flatten()
            .as_deref()
            == Some(key)
}

pub async fn still_granted(app: &AppHandle, token: &str, key: &str, grant: &Grant) -> bool {
    let app = app.clone();
    let token = token.to_owned();
    let key = key.to_owned();
    let grant = grant.clone();
    matches!(
        tauri::async_runtime::spawn_blocking(move || authorized(&app, &token, &key, &grant)).await,
        Ok(true)
    )
}
