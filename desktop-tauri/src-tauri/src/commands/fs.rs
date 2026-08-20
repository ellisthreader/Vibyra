use tauri::{AppHandle, Emitter, State};
use vibyra_core::fsx::{self, DirEntryInfo, FilePreview, WorkspaceWatcher};
use vibyra_core::CoreError;

use crate::state::AppState;

use super::run_blocking_core;

const PREVIEW_MAX_BYTES: usize = 256 * 1024;

#[tauri::command]
pub async fn fs_list_dir(path: String, show_hidden: bool) -> Result<Vec<DirEntryInfo>, CoreError> {
    run_blocking_core(move || fsx::list_dir(&path, show_hidden)).await
}

#[tauri::command]
pub async fn fs_read_preview(path: String) -> Result<FilePreview, CoreError> {
    run_blocking_core(move || fsx::read_file_preview(&path, PREVIEW_MAX_BYTES)).await
}

#[tauri::command]
pub async fn fs_home_dir() -> String {
    fsx::home_dir()
}

/// Watches `root` recursively; debounced change batches are emitted to the
/// frontend as `fs:changed` events. Replaces any previous watcher.
#[tauri::command]
pub async fn watch_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    root: String,
) -> Result<(), CoreError> {
    let watcher = WorkspaceWatcher::start(&root, move |changes| {
        let _ = app.emit("fs:changed", &changes);
    })?;
    *state.watcher.lock() = Some(watcher);
    Ok(())
}

#[tauri::command]
pub async fn unwatch_workspace(state: State<'_, AppState>) -> Result<(), CoreError> {
    *state.watcher.lock() = None;
    Ok(())
}
