use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use vibyra_core::settings::Settings;
use vibyra_core::CoreError;

use super::run_blocking_core;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    #[serde(flatten)]
    settings: Settings,
    openai_key_configured: bool,
    secure_storage_available: bool,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<SettingsView, CoreError> {
    Ok(view(&state))
}

/// The file is written, and fsynced, under `settings_write` alone: holding
/// `settings` across the disk write blocked every terminal launch and AI call
/// that only wanted to read a setting. Memory still changes only once the
/// write has succeeded, and two saves cannot interleave: whichever writes the
/// file last is also the one left in memory.
#[tauri::command]
pub async fn save_settings(app: AppHandle, mut settings: Settings) -> Result<(), CoreError> {
    run_blocking_core(move || {
        let state = app.state::<AppState>();
        let _write = state.settings_write.lock();
        // Adding a project past the plan's limit is refused; keeping, reordering
        // and removing projects never is.
        state
            .account
            .plan_limits()
            .admit_project_list(&state.settings.lock().projects, &settings.projects)
            .map_err(CoreError::PlanLimit)?;
        settings.legacy_openai_api_key = state.settings.lock().legacy_openai_api_key.clone();
        settings.save_to(&state.settings_path)?;
        *state.settings.lock() = settings;
        Ok(())
    })
    .await
}

fn view(state: &AppState) -> SettingsView {
    let settings = state.settings.lock().clone();
    SettingsView {
        settings,
        openai_key_configured: false, // Retired compatibility field; use ai_service_status.
        secure_storage_available: state.account.snapshot().secure_storage,
    }
}
