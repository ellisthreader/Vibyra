//! Commands for the teammate roster and what each teammate may reach.
//!
//! Every one of these resolves the account scope itself rather than taking it
//! from the webview. An `account` parameter the renderer could set would make
//! the boundary a suggestion.

use tauri::State;
use vibyra_core::agent_model::PlaceAccess;
use vibyra_core::agent_profiles::{AgentPlace, AgentProfile, AgentUpdate, NewAgent};

use super::run_blocking;
use crate::state::AppState;

/// The signed-in account's Agent Mode world, or a sentence saying why not.
pub fn world(state: &AppState) -> Result<std::sync::Arc<crate::agent_mode::AgentWorld>, String> {
    let scope = state
        .account
        .snapshot()
        .profile
        .map(|profile| profile.welcome_key)
        .ok_or("Sign in to use Agent Mode.")?;
    let root = state
        .settings_path
        .parent()
        .map(|dir| dir.to_path_buf())
        .ok_or("Vibyra could not find its own settings folder.")?;
    state.agents.world(&scope, &root)
}

#[tauri::command]
pub async fn agent_profile_list(state: State<'_, AppState>) -> Result<Vec<AgentProfile>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_profiles::list(&world.db, &world.account).map_err(|e| e.to_string())
    })
    .await
}

/// Creates a teammate, its private home folder and the grant over it.
#[tauri::command]
pub async fn agent_profile_create(
    state: State<'_, AppState>,
    request: NewAgent,
) -> Result<AgentProfile, String> {
    let world = world(&state)?;
    run_blocking(move || {
        let root = world.root.clone();
        vibyra_core::agent_profiles::create(&world.db, &world.account, &root, request)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_profile_update(
    state: State<'_, AppState>,
    id: String,
    change: AgentUpdate,
) -> Result<AgentProfile, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_profiles::update(&world.db, &world.account, &id, change)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_profile_archive(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_profiles::archive(&world.db, &world.account, &id, archived)
            .map_err(|e| e.to_string())
    })
    .await
}

/// Deletes a teammate and everything that cascades with it.
///
/// The agent's home folder goes too. Leaving it would strand files the user
/// can no longer reach through Vibyra and would never think to look for.
#[tauri::command]
pub async fn agent_profile_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        if let Ok(profile) = vibyra_core::agent_profiles::get(&world.db, &world.account, &id) {
            let _ = std::fs::remove_dir_all(&profile.home_path);
        }
        vibyra_core::agent_profiles::delete(&world.db, &world.account, &id)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_place_list(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<Vec<AgentPlace>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_profiles::list_places(&world.db, &agent_id).map_err(|e| e.to_string())
    })
    .await
}

/// Grants a folder. The path is canonicalised natively before it is stored, so
/// a picker result is never trusted as text.
#[tauri::command]
pub async fn agent_place_grant(
    state: State<'_, AppState>,
    agent_id: String,
    path: String,
    access: PlaceAccess,
) -> Result<AgentPlace, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_profiles::grant_place(&world.db, &agent_id, &path, access)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_place_revoke(
    state: State<'_, AppState>,
    agent_id: String,
    place_id: String,
) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_profiles::revoke_place(&world.db, &agent_id, &place_id)
            .map_err(|e| e.to_string())
    })
    .await
}

/// What the installed CLIs can actually do, so the UI offers only controls it
/// has evidence for.
#[tauri::command]
pub async fn agent_engine_capabilities(
) -> Result<Vec<vibyra_core::agent_runtime::EngineCapabilities>, String> {
    run_blocking(|| Ok(crate::agent_mode::probe_engines())).await
}
