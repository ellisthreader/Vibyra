use serde::Serialize;
use tauri::State;
use vibyra_core::settings::Settings;
use vibyra_core::CoreError;

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

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    mut settings: Settings,
) -> Result<(), CoreError> {
    let mut current = state.settings.lock();
    settings.legacy_openai_api_key = current.legacy_openai_api_key.clone();
    settings.save_to(&state.settings_path)?;
    *current = settings;
    Ok(())
}

fn view(state: &AppState) -> SettingsView {
    SettingsView {
        settings: state.settings.lock().clone(),
        openai_key_configured: state.openai_api_key.lock().is_some(),
        secure_storage_available: *state.secret_store_available.lock(),
    }
}
