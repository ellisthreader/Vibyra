//! Apply a reviewed Agent worktree to the teammate's granted source folder.
use crate::agent_computer_access::{account_scope, looks_uuid};
use crate::agent_computer_store;
use crate::agent_computer_tools;
use crate::commands::run_blocking;
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, Manager};

#[path = "agent_computer_git_cmd.rs"]
pub(crate) mod git_cmd;

/// `snapshot` is the `publishSnapshot.snapshotSha256` the review listing
/// returned; the worktree must still match it byte for byte.
#[tauri::command]
pub async fn agent_computer_worktree_apply(
    app: AppHandle,
    id: String,
    snapshot: String,
) -> Result<Value, String> {
    if !looks_uuid(&id) {
        return Err("Unknown computer grant.".into());
    }
    if snapshot.len() != 64 || !snapshot.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Review the worktree changes before applying them.".into());
    }
    let state = app.state::<AppState>();
    let scope = account_scope(&state)?;
    let saved = app.clone();
    run_blocking(move || {
        let state = saved.state::<AppState>();
        let _guard = state.agent_computer_write.lock();
        if account_scope(&state)? != scope {
            return Err("Your account changed. Refresh Agent Computer before applying.".into());
        }
        let file = agent_computer_store::path(&state.settings_path)?;
        let grant = agent_computer_store::active_worktree(&file, &scope, &id)?;
        agent_computer_tools::apply_reviewed(&grant, &snapshot)
    })
    .await
}

#[cfg(test)]
#[path = "agent_computer_apply_tests.rs"]
mod tests;
