use tauri::State;

use crate::account_billing;
use crate::state::AppState;

/// "Download my data": where the newest export stands. `null` when the server does not offer it.
#[tauri::command]
pub async fn account_export_status(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    account_billing::account_export(&state, false).await
}

/// Asks for a new export (the server allows one a day) and returns the same shape as the status.
#[tauri::command]
pub async fn account_export_request(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    account_billing::account_export(&state, true).await
}

/// Opens the ready archive's short-lived signed link in the browser. The link itself never reaches the renderer.
#[tauri::command]
pub async fn account_export_open(state: State<'_, AppState>) -> Result<(), String> {
    account_billing::account_export_open(&state).await
}

/// "Keep run history for": the choices within the server's maximum. `null` when the server does not offer it.
#[tauri::command]
pub async fn account_retention(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    account_billing::account_retention(&state, None).await
}

/// `days` of `null` goes back to the server's standard.
#[tauri::command]
pub async fn account_retention_set(
    state: State<'_, AppState>,
    days: Option<u32>,
) -> Result<serde_json::Value, String> {
    account_billing::account_retention(&state, Some(days)).await
}
