//! Commands for the skill library.

use tauri::State;
use vibyra_core::skills::{Skill, SkillDraft, SkillOrigin};

use super::agent_roster::world;
use super::run_blocking;
use crate::state::AppState;

// ------------------------------------------------------------------ skills

#[tauri::command]
pub async fn skill_list(state: State<'_, AppState>) -> Result<Vec<Skill>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::skills::list(&world.db, &world.account).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn skill_install(state: State<'_, AppState>, draft: SkillDraft) -> Result<Skill, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::skills::install(&world.db, &world.account, draft, SkillOrigin::User)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn skill_revise(
    state: State<'_, AppState>,
    id: String,
    draft: SkillDraft,
) -> Result<Skill, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::skills::revise(&world.db, &world.account, &id, draft)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn skill_set_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::skills::set_status(&world.db, &world.account, &id, &status)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn skill_assign(
    state: State<'_, AppState>,
    agent_id: String,
    skill_id: String,
    enabled: bool,
) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::skills::assign(&world.db, &agent_id, &skill_id, enabled)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn skill_assigned(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<Vec<Skill>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::skills::assigned(&world.db, &world.account, &agent_id)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn skill_history(
    state: State<'_, AppState>,
    skill_id: String,
) -> Result<Vec<Skill>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::skills::history(&world.db, &skill_id).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn skill_roll_back(
    state: State<'_, AppState>,
    skill_id: String,
    version: i64,
) -> Result<Skill, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::skills::roll_back(&world.db, &world.account, &skill_id, version)
            .map_err(|e| e.to_string())
    })
    .await
}
