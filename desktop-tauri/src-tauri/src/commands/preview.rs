use std::sync::Arc;

use tauri::State;
use vibyra_core::preview::{inspect_project, PreviewInspection, PreviewStatus};
use vibyra_core::CoreError;

use crate::state::AppState;

use super::run_blocking_core;

#[tauri::command]
pub async fn preview_inspect(root: String) -> Result<PreviewInspection, CoreError> {
    run_blocking_core(move || inspect_project(&root)).await
}

#[tauri::command]
pub async fn preview_start(
    state: State<'_, AppState>,
    root: String,
    target_id: String,
) -> Result<PreviewStatus, CoreError> {
    let preview = Arc::clone(&state.preview);
    run_blocking_core(move || preview.start(&root, &target_id)).await
}

#[tauri::command]
pub async fn preview_status(
    state: State<'_, AppState>,
    root: String,
    target_id: String,
) -> Result<PreviewStatus, CoreError> {
    let preview = Arc::clone(&state.preview);
    run_blocking_core(move || preview.status(&root, &target_id)).await
}

#[tauri::command]
pub async fn preview_stop(
    state: State<'_, AppState>,
    root: String,
    target_id: String,
) -> Result<PreviewStatus, CoreError> {
    let preview = Arc::clone(&state.preview);
    run_blocking_core(move || preview.stop(&root, &target_id)).await
}

#[tauri::command]
pub async fn preview_stop_project(
    state: State<'_, AppState>,
    root: String,
) -> Result<(), CoreError> {
    let preview = Arc::clone(&state.preview);
    run_blocking_core(move || preview.stop_project(&root)).await
}
