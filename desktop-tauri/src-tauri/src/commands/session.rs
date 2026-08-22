use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::State;
use vibyra_core::CoreResult;

use super::run_blocking_core;
use crate::session_store::{self, PersistedPane, TerminalSession};
use crate::state::AppState;

fn session_path(state: &AppState) -> PathBuf {
    state
        .settings_path
        .parent()
        .map(|dir| dir.join("session.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("vibyra-session.json"))
}

/// Saves the workspace layout, and optionally each pane's on-screen output.
///
/// Snapshots are read here rather than sent from the UI: the frontend never
/// has to hold megabytes of terminal text, and a pane that died between the
/// UI's last render and this call simply contributes no snapshot.
#[tauri::command]
pub async fn save_terminal_session(
    state: State<'_, AppState>,
    panes: Vec<PersistedPane>,
    include_snapshots: bool,
) -> CoreResult<()> {
    // The user's setting is authoritative — a caller asking for snapshots
    // cannot override it.
    let persist_output = state.settings.lock().persist_terminal_scrollback;
    let manager = Arc::clone(&state.manager);
    let path = session_path(&state);
    let saved_at_ms = session_store::now_ms();

    run_blocking_core(move || {
        let panes = panes
            .into_iter()
            .map(|mut pane| {
                // A live pane's output is read straight from the manager. An
                // already-suspended pane (id 0) has no session, so it keeps
                // the snapshot the UI carried over — otherwise its output
                // would be lost on a second restart without a resume.
                //
                // A layout-only save must not *erase* what it did not come to
                // collect. It rewrites the whole file, so dropping the caller's
                // snapshot here would blank every restored pane the moment the
                // workspace changed shape — and an unclean exit before the next
                // full save would bring them back with nothing in them.
                pane.snapshot = if !persist_output {
                    None
                } else if include_snapshots {
                    manager
                        .snapshot(pane.id)
                        .ok()
                        .or_else(|| pane.snapshot.take())
                } else {
                    pane.snapshot.take()
                };
                pane
            })
            .collect();
        session_store::save(
            &path,
            TerminalSession {
                version: session_store::VERSION,
                saved_at_ms,
                panes,
            },
        )
    })
    .await
}

#[tauri::command]
pub async fn load_terminal_session(state: State<'_, AppState>) -> CoreResult<TerminalSession> {
    let path = session_path(&state);
    run_blocking_core(move || Ok(session_store::load(&path))).await
}

#[tauri::command]
pub async fn clear_terminal_session(state: State<'_, AppState>) -> CoreResult<()> {
    let path = session_path(&state);
    run_blocking_core(move || session_store::clear(&path)).await
}

/// Lets the window close. Until this is called, `CloseRequested` is vetoed so
/// the UI can confirm with the user and flush the session to disk first.
#[tauri::command]
pub async fn confirm_close(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.closing.store(true, Ordering::SeqCst);
    if let Some(window) = tauri::Manager::get_webview_window(&app, "main") {
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Arms the close veto. Called by the workspace when it mounts the handler
/// that answers `vibyra://close-requested`, and disarmed when it unmounts.
///
/// Without this the veto was unconditional, so on the sign-in screen — where
/// no workspace is mounted and nothing listens — the window could not be
/// closed at all.
#[tauri::command]
pub async fn arm_close_guard(state: State<'_, AppState>, armed: bool) -> Result<(), String> {
    state.close_guard_armed.store(armed, Ordering::SeqCst);
    Ok(())
}

/// The UI confirming it received the close request and is now asking the user.
/// Stops the watchdog, which exists only for a webview that never answers.
#[tauri::command]
pub async fn ack_close_request(state: State<'_, AppState>) -> Result<(), String> {
    state.close_requested_ack.store(true, Ordering::SeqCst);
    Ok(())
}
