//! Bounded local review of changes in the active Agent worktree.
use crate::agent_computer_access::{account_scope, looks_uuid};
use crate::agent_computer_store;
use crate::agent_computer_tools;
use crate::commands::run_blocking;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn agent_computer_worktree_status(
    state: State<'_, AppState>,
    id: String,
) -> Result<Value, String> {
    review(state, id, "git_status", json!({})).await
}

#[tauri::command]
pub async fn agent_computer_worktree_diff(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> Result<Value, String> {
    review(state, id, "git_diff", json!({"path":path})).await
}

async fn review(
    state: State<'_, AppState>,
    id: String,
    operation: &'static str,
    args: Value,
) -> Result<Value, String> {
    if !looks_uuid(&id) {
        return Err("Unknown computer grant.".into());
    }
    let scope = account_scope(&state)?;
    let expected_scope = scope.clone();
    let file = agent_computer_store::path(&state.settings_path)?;
    let result = run_blocking(move || {
        let grant = agent_computer_store::active_worktree(&file, &scope, &id)?;
        agent_computer_tools::review_git(&grant, operation, &args)
    })
    .await?;
    if account_scope(&state)? != expected_scope {
        return Err("Your account changed. Refresh Agent Computer before reviewing.".into());
    }
    Ok(result)
}
