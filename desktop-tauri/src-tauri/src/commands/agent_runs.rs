//! Account-owned task history and immutable output artifacts.
use super::{agent_roster::world, run_blocking};
use crate::state::AppState;
use tauri::State;
use vibyra_core::agent_runs::{self, AgentRun, Artifact};

#[tauri::command]
pub async fn agent_run_list(
    state: State<'_, AppState>,
    chat_id: Option<String>,
) -> Result<Vec<AgentRun>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        let mut runs = agent_runs::list(&world.db, &world.account, chat_id.as_deref())
            .map_err(|e| e.to_string())?;
        for run in &mut runs {
            run.spec.context.clear();
            run.spec.prompt = run.spec.prompt.chars().take(300).collect();
        }
        Ok(runs)
    })
    .await
}

#[tauri::command]
pub async fn agent_run_get(state: State<'_, AppState>, run_id: String) -> Result<AgentRun, String> {
    let world = world(&state)?;
    run_blocking(move || {
        agent_runs::get(&world.db, &world.account, &run_id).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_run_artifacts(
    state: State<'_, AppState>,
    run_id: String,
) -> Result<Vec<Artifact>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        agent_runs::artifact_list(&world.db, &world.account, &run_id).map_err(|e| e.to_string())
    })
    .await
}
