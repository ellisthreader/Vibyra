use crate::{
    agent_computer_access::account_scope, agent_computer_store, commands::run_blocking,
    state::AppState,
};
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn agent_computer_grants(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let scope = account_scope(&state)?;
    let file = agent_computer_store::path(&state.settings_path)?;
    let grants = run_blocking(move || agent_computer_store::load(&file)).await?;
    Ok(grants
        .into_iter()
        .filter(|g| g.account_scope == scope)
        .map(|g| {
            json!({"id":g.id,"agentId":g.agent_id,"hostId":g.host_id,
            "label":g.label,"path":g.source_path.as_ref().unwrap_or(&g.path),
            "worktreePath":g.source_path.as_ref().filter(|source| *source != &g.path).map(|_| &g.path),
            "canWrite":g.can_write,"needsReselection":g.can_write && g.source_path.is_none(),
            "revoked":g.revoked})
        })
        .collect())
}
