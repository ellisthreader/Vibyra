use crate::agent_computer_store::{self, Grant};
use crate::secret_store::SecretStore;
use crate::state::AppState;
use tauri::{AppHandle, Manager};

pub async fn still_granted(app: &AppHandle, token: &str, grant: &Grant) -> bool {
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
    let Ok(file) = agent_computer_store::path(&state.settings_path) else {
        return false;
    };
    let saved = grant.clone();
    matches!(
        tauri::async_runtime::spawn_blocking(move || {
            let grants = agent_computer_store::load(&file)?;
            Ok::<_, String>(
                grants.iter().any(|g| {
                    !g.revoked
                        && g.id == saved.id
                        && g.path == saved.path
                        && g.can_write == saved.can_write
                        && g.host_id == saved.host_id
                        && g.account_scope == saved.account_scope
                }) && SecretStore.read_agent_runner_key(&saved.id)?.is_some(),
            )
        })
        .await,
        Ok(Ok(true))
    )
}
