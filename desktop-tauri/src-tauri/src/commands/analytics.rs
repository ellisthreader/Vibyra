use std::collections::BTreeMap;

use serde_json::Value;
use tauri::{AppHandle, State};

use crate::{analytics, analytics_event::Event, analytics_store::Choice, state::AppState};

#[tauri::command]
pub async fn analytics_track(
    app: AppHandle,
    state: State<'_, AppState>,
    event: Event,
    properties: BTreeMap<String, Value>,
    event_id: Option<String>,
) -> Result<(), String> {
    analytics::track(
        &state,
        event,
        properties,
        event_id,
        &app.package_info().version.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn analytics_consent_get(
    state: State<'_, AppState>,
) -> Result<analytics::ConsentSnapshot, String> {
    analytics::consent_get(&state).await
}

#[tauri::command]
pub async fn analytics_consent_set(
    state: State<'_, AppState>,
    choice: Choice,
) -> Result<analytics::ConsentSnapshot, String> {
    analytics::consent_set(&state, choice).await
}

#[tauri::command]
pub async fn analytics_flush(state: State<'_, AppState>) -> Result<(), String> {
    analytics::flush(&state).await
}
