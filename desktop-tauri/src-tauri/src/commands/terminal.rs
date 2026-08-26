use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;
use vibyra_core::pty::{LaunchSpec, SessionId, SessionInfo, Visibility};
use vibyra_core::workspace_preflight::{
    safe_workspace_preflight as inspect_safe_workspace, SafeWorkspacePreflight,
};
use vibyra_core::CoreError;

use super::run_blocking_core;
use super::terminal_launch::{
    canonical_directory, configure_dimensions, validate_ssh_target, CreateTerminalRequest,
};
use super::terminal_prepare::{prepare, LaunchContext};
use crate::sink::TermEvent;
use crate::state::AppState;

#[tauri::command]
pub async fn create_terminal(
    state: State<'_, AppState>,
    on_event: Channel<TermEvent>,
    request: CreateTerminalRequest,
) -> Result<SessionInfo, CoreError> {
    let context = {
        let settings = state.settings.lock();
        LaunchContext {
            default_shell: settings.default_shell.clone(),
            custom_agents: settings.custom_agents.clone(),
            workspace_root: settings.workspace_root.clone(),
            worktrees_root: state
                .settings_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."))
                .join("terminal-worktrees"),
        }
    };
    let manager = Arc::clone(&state.manager);
    let info = run_blocking_core(move || {
        let prepared = prepare(request, context)?;
        let mut info =
            manager.create_session(&prepared.agent_id, &prepared.title, &prepared.spec)?;
        // Only the prepared launch knows the worktree's branch and base; the
        // manager describes sessions generically and reports no workspace.
        info.workspace = prepared.workspace;
        Ok(info)
    })
    .await?;
    state.sink.attach(info.id, on_event);
    Ok(info)
}

#[tauri::command]
pub async fn safe_workspace_preflight(
    project_root: String,
) -> Result<SafeWorkspacePreflight, CoreError> {
    run_blocking_core(move || {
        let root = canonical_directory(Some(project_root))?
            .ok_or_else(|| CoreError::InvalidPath("project folder is required".into()))?;
        inspect_safe_workspace(std::path::Path::new(&root))
    })
    .await
}

#[tauri::command]
pub async fn create_ssh_terminal(
    state: State<'_, AppState>,
    on_event: Channel<TermEvent>,
    target: String,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<SessionInfo, CoreError> {
    validate_ssh_target(&target)?;
    let mut spec = LaunchSpec::ssh(&target, &[]);
    configure_dimensions(&mut spec, rows, cols)?;
    let info = state.manager.create_session("ssh", &target, &spec)?;
    state.sink.attach(info.id, on_event);
    Ok(info)
}

/// Deliberately **not** `async`. Tauri hands every async command to
/// `tokio::spawn`, and two spawned tasks can be polled in either order, so two
/// keystrokes posted a millisecond apart could reach the PTY reversed. A
/// synchronous command runs inline on the thread that receives IPC messages,
/// which WebKit delivers in order, so the byte order is preserved structurally.
///
/// Nothing here may block that thread, which is why `write_input` only queues:
/// the blocking PTY write happens on the session's own writer thread. Keeping
/// the ordering guarantee here is what lets the frontend post each keystroke
/// the moment it is typed instead of waiting for the previous one's response —
/// that wait is what made typing appear one key behind.
#[tauri::command]
pub fn write_terminal(
    state: State<'_, AppState>,
    id: SessionId,
    data: String,
) -> Result<(), CoreError> {
    state.manager.write_input(id, data.as_bytes())
}

#[tauri::command]
pub async fn resize_terminal(
    state: State<'_, AppState>,
    id: SessionId,
    rows: u16,
    cols: u16,
) -> Result<(), CoreError> {
    state.manager.resize(id, rows, cols)
}

#[tauri::command]
pub async fn set_terminal_visibility(
    state: State<'_, AppState>,
    id: SessionId,
    visibility: Visibility,
) -> Result<(), CoreError> {
    state.manager.set_visibility(id, visibility)
}

#[tauri::command]
pub async fn terminal_snapshot(
    state: State<'_, AppState>,
    id: SessionId,
) -> Result<String, CoreError> {
    state.manager.snapshot(id)
}

#[tauri::command]
pub async fn kill_terminal(state: State<'_, AppState>, id: SessionId) -> Result<(), CoreError> {
    state.manager.kill(id)
}

#[tauri::command]
pub async fn remove_terminal(state: State<'_, AppState>, id: SessionId) -> Result<(), CoreError> {
    state.manager.remove(id)?;
    state.sink.detach(id);
    Ok(())
}

#[tauri::command]
pub async fn list_terminals(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, CoreError> {
    Ok(state.manager.list())
}
