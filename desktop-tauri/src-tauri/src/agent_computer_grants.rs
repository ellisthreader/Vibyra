use crate::agent_computer_access::account_scope;
use crate::agent_computer_store;
use crate::commands::run_blocking;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn agent_computer_grants(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let scope = account_scope(&state)?;
    let file = agent_computer_store::path(&state.settings_path)?;
    let grants = run_blocking(move || agent_computer_store::load(&file)).await?;
    Ok(grants
        .into_iter()
        .filter(|grant| grant.account_scope == scope)
        .map(|grant| {
            let needs_reselection = grant.validate_path().is_err();
            json!({"id":grant.id,"agentId":grant.agent_id,"hostId":grant.host_id,
                "label":grant.label,"path":grant.source_path.as_ref().unwrap_or(&grant.path),
                "worktreePath":grant.source_path.as_ref().filter(|source| *source != &grant.path).map(|_| &grant.path),
                "canWrite":grant.can_write,"needsReselection":needs_reselection,
                "revoked":grant.revoked})
        })
        .collect())
}
