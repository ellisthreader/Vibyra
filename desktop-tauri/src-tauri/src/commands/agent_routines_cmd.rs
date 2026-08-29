//! Commands for routines and their run history.

use tauri::State;
use vibyra_core::routines::{Routine, RoutineDraft, RoutineRun};

use super::agent_roster::world;
use super::run_blocking;
use crate::state::AppState;

// ---------------------------------------------------------------- routines

#[tauri::command]
pub async fn routine_list(
    state: State<'_, AppState>,
    agent_id: Option<String>,
) -> Result<Vec<Routine>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::routines::list(&world.db, agent_id.as_deref()).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn routine_create(
    state: State<'_, AppState>,
    draft: RoutineDraft,
) -> Result<Routine, String> {
    let world = world(&state)?;
    run_blocking(move || vibyra_core::routines::create(&world.db, draft).map_err(|e| e.to_string()))
        .await
}

#[tauri::command]
pub async fn routine_update(
    state: State<'_, AppState>,
    id: String,
    draft: RoutineDraft,
) -> Result<Routine, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::routines::update(&world.db, &id, draft).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn routine_set_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<Routine, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::routines::set_enabled(&world.db, &id, enabled).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn routine_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || vibyra_core::routines::delete(&world.db, &id).map_err(|e| e.to_string()))
        .await
}

#[tauri::command]
pub async fn routine_history(
    state: State<'_, AppState>,
    routine_id: String,
) -> Result<Vec<RoutineRun>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::routines::runs::history(&world.db, &routine_id, 20).map_err(|e| e.to_string())
    })
    .await
}

/// The timezones the routine editor offers, the machine's own first.
#[tauri::command]
pub async fn routine_zones() -> Result<Vec<String>, String> {
    Ok(vibyra_core::routines::offered_zones())
}
