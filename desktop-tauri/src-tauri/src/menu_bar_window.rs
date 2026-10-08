//! Main-window helpers for the menu bar status: bring it forward, set the Dock badge.
use tauri::{AppHandle, Manager};

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// `None` clears the badge. Only macOS draws a count; elsewhere this is a no-op.
pub fn set_badge(app: &AppHandle, count: Option<i64>) {
    #[cfg(target_os = "macos")]
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_badge_count(count);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, count);
}
