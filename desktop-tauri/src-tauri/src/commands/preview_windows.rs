use super::run_blocking;
use crate::window_preview::{self, WindowInfo};

#[tauri::command]
pub fn preview_windows_available() -> bool {
    window_preview::available()
}

/// Called only by the owner opening the native window sharing picker.
#[tauri::command]
pub async fn preview_windows_list() -> Result<Vec<WindowInfo>, String> {
    run_blocking(window_preview::list).await
}

#[tauri::command]
pub async fn preview_windows_permission() -> Result<(), String> {
    run_blocking(window_preview::permission).await
}
