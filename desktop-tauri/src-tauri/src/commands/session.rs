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
    let keep_output = include_snapshots && state.settings.lock().persist_terminal_scrollback;
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
                pane.snapshot = keep_output
                    .then(|| manager.snapshot(pane.id).ok().or_else(|| pane.snapshot.take()))
                    .flatten();
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
