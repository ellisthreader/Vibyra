//! Commands for an agent's memory.
//!
//! Thin by design: every rule these touch lives in `vibyra-core`, and the only
//! thing added here is the account scope and a blocking thread. Skills,
//! routines and decisions have their own files beside this one.

use tauri::State;
use vibyra_core::agent_memory::{MemoryEntry, MemoryStatus, NewMemory};

use super::agent_roster::world;
use super::run_blocking;
use crate::state::AppState;

#[tauri::command]
pub async fn agent_memory_list(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<Vec<MemoryEntry>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_memory::list(&world.db, &agent_id).map_err(|e| e.to_string())
    })
    .await
}

/// Adds an entry the user wrote themselves — active immediately, because
/// writing it *is* the approval.
#[tauri::command]
pub async fn agent_memory_add(
    state: State<'_, AppState>,
    agent_id: String,
    entry: NewMemory,
) -> Result<MemoryEntry, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_memory::record(&world.db, &agent_id, entry, MemoryStatus::Active)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_memory_set_status(
    state: State<'_, AppState>,
    id: String,
    status: MemoryStatus,
) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_memory::set_status(&world.db, &id, status).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_memory_amend(
    state: State<'_, AppState>,
    id: String,
    body: Option<String>,
    priority: Option<i64>,
    pinned: Option<bool>,
) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_memory::amend(&world.db, &id, body.as_deref(), priority, pinned)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_memory_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_memory::delete(&world.db, &id).map_err(|e| e.to_string())
    })
    .await
}
