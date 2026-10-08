//! IPC for the Agent V2 runner: which AI account Agents use, and what the
//! runner is doing. The runner loop picks up a new selection on its next
//! tick and re-registers (rotating the runner key).

use super::selection::{self, Selection};
use super::status::{self, RunnerStatus};
use crate::commands::run_blocking;
use crate::state::AppState;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn agent_v2_runner_status() -> RunnerStatus {
    status::snapshot()
}

#[tauri::command]
pub async fn agent_v2_select_account(
    app: AppHandle,
    provider: String,
    account: String,
    model: String,
    effort: Option<String>,
) -> Result<RunnerStatus, String> {
    let selection = Selection {
        provider,
        account,
        model,
        effort,
    };
    selection.validate()?;
    let dir = app
        .state::<AppState>()
        .settings_path
        .parent()
        .ok_or("No Vibyra settings directory")?
        .to_path_buf();
    run_blocking(move || {
        // Only accounts Vibyra actually holds; never a caller-chosen folder.
        crate::provider_auth_registry::Registry::load()
            .home(&selection.provider, &selection.account)?;
        selection::save(&dir, &selection)
    })
    .await?;
    Ok(status::snapshot())
}
