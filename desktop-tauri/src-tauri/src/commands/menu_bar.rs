//! The renderer's live agent snapshot for the menu bar item and Dock badge.
use tauri::AppHandle;

use crate::menu_bar_model::StatusSnapshot;
use crate::menu_bar_status::apply;

/// Synchronous on purpose: tray and Dock calls belong on the main thread.
#[tauri::command]
pub fn menu_bar_status(app: AppHandle, snapshot: StatusSnapshot) {
    apply(&app, snapshot);
}
