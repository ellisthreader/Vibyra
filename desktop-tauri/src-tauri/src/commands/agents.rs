use tauri::State;
use vibyra_core::agents::{resolve_agents, ResolvedAgent};
use vibyra_core::CoreError;

use crate::state::AppState;

#[tauri::command]
pub async fn list_agents(state: State<'_, AppState>) -> Result<Vec<ResolvedAgent>, CoreError> {
    let custom = state.settings.lock().custom_agents.clone();
    Ok(resolve_agents(&custom))
}
