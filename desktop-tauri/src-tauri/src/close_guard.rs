//! Who gets to decide that the window closes.
//!
//! Closing is vetoed once so the workspace can warn about live terminals and
//! flush the session to disk first. That veto has to be conditional: it is
//! answered by a listener the *workspace* mounts, and the workspace is only
//! mounted once the account gate passes. Vetoing unconditionally meant the
//! sign-in screen emitted an event nothing was listening for, and the window
//! could not be closed at all — the user's only way out was to kill it.

use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{Emitter, Manager, Window};

use crate::state::AppState;

/// How long the UI has to say it heard the close request.
///
/// This is not how long the user has to decide — the acknowledgement comes
/// before the confirm prompt is shown, and once it lands the window waits
/// indefinitely. It only bounds a webview that is still loading, has crashed,
/// or threw before its listener ran.
const ACK_GRACE: Duration = Duration::from_secs(4);

/// True when the UI should be asked first. False means close now: either the
/// user already confirmed, or nothing is mounted that could answer.
pub fn should_veto(state: &AppState) -> bool {
    !state.closing.load(Ordering::SeqCst) && state.close_guard_armed.load(Ordering::SeqCst)
}

/// Hands the decision to the UI, with a watchdog behind it.
pub fn hand_off(app: &tauri::AppHandle) {
    app.state::<AppState>()
        .close_requested_ack
        .store(false, Ordering::SeqCst);
    let _ = app.emit("vibyra://close-requested", ());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(ACK_GRACE).await;
        let state = app.state::<AppState>();
        if state.close_requested_ack.load(Ordering::SeqCst) || state.closing.load(Ordering::SeqCst)
        {
            return;
        }
        state.closing.store(true, Ordering::SeqCst);
        let _ = finish(&app);
    });
}

pub fn window_event(window: &Window, event: &tauri::WindowEvent) {
    let tauri::WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    let state = window.state::<AppState>();
    // The red traffic light closes the view on Mac. Terminals keep running;
    // Dock reopen returns to the same webview, without a restore or respawn.
    #[cfg(target_os = "macos")]
    if !state.closing.load(Ordering::SeqCst) {
        api.prevent_close();
        let _ = window.hide();
        return;
    }
    if should_veto(&state) {
        api.prevent_close();
        hand_off(window.app_handle());
    }
}

pub fn run_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
            if should_veto(&app.state::<AppState>()) {
                if let Some(window) = app.get_webview_window("main") {
                    api.prevent_exit();
                    let _ = window.show();
                    let _ = window.set_focus();
                    hand_off(app);
                }
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        tauri::RunEvent::Exit => app.state::<AppState>().manager.shutdown(),
        _ => {}
    }
}

pub fn finish(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    app.exit(0);
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("main") {
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}
