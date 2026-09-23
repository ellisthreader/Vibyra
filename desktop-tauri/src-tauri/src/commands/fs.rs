use tauri::{AppHandle, Emitter, Manager};
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
///
/// Starting a recursive watch registers the whole tree with the OS and
/// stopping one joins its event thread, so both run on a blocking thread.
#[tauri::command]
pub async fn watch_workspace(app: AppHandle, root: String) -> Result<(), CoreError> {
    run_blocking_core(move || {
        let emitter = app.clone();
        let watcher = WorkspaceWatcher::start(&root, move |changes| {
            let _ = emitter.emit("fs:changed", &changes);
        })?;
        let previous = app.state::<AppState>().watcher.lock().replace(watcher);
        drop(previous);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn unwatch_workspace(app: AppHandle) -> Result<(), CoreError> {
    run_blocking_core(move || {
        let previous = app.state::<AppState>().watcher.lock().take();
        drop(previous);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn fs_changes(root: String) -> Result<fsx::git_changes::Changes, CoreError> {
    run_blocking_core(move || fsx::git_changes::changes(&root)).await
}

#[tauri::command]
pub async fn workspace_worktrees(root: String) -> Result<fsx::worktrees::Inventory, CoreError> {
    run_blocking_core(move || fsx::worktrees::inventory(&root)).await
}

#[tauri::command]
pub async fn fs_change_preview(root: String, path: String) -> Result<String, CoreError> {
    run_blocking_core(move || fsx::git_changes::change_preview(&root, &path)).await
}
