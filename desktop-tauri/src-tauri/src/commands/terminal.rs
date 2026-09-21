use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;
use vibyra_core::pty::{LaunchSpec, SessionId, SessionInfo, Visibility};
use vibyra_core::workspace_init::initialise_repository;
use vibyra_core::workspace_preflight::{
    is_git_work_tree, safe_workspace_preflight as inspect_safe_workspace, SafeWorkspacePreflight,
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
    if request.workspace_mode.as_deref() == Some("safe") {
        super::worktree_access::require_github(&state)
            .await
            .map_err(CoreError::Settings)?;
    }
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
        manager.create_session(&prepared.agent_id, &prepared.title, &prepared.spec)
    })
    .await?;
    state.sink.attach(info.id, on_event);
    Ok(info)
}

/// Whether Safe mode applies to this folder at all. The launcher asks on every
/// project switch, so it stays cheap and ungated: a folder with no Git in it
/// must be able to say so without a GitHub connection or a scan of the tree.
#[tauri::command]
pub async fn safe_workspace_supported(project_root: String) -> Result<bool, CoreError> {
    run_blocking_core(move || Ok(is_git_work_tree(std::path::Path::new(&project_root)))).await
}

/// Make the project folder a repository so Safe mode can branch from it:
/// `git init` and one commit, no remote and nothing pushed. This writes to
/// someone's folder, so it runs only from the button that says it will.
#[tauri::command]
pub async fn set_up_git_repository(project_root: String) -> Result<(), CoreError> {
    run_blocking_core(move || initialise_repository(std::path::Path::new(&project_root))).await
}

#[tauri::command]
pub async fn safe_workspace_preflight(
    state: State<'_, AppState>,
    project_root: String,
) -> Result<SafeWorkspacePreflight, CoreError> {
    super::worktree_access::require_github(&state)
        .await
        .map_err(CoreError::Settings)?;
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

#[tauri::command]
pub async fn write_terminal(
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

#[tauri::command]
pub async fn terminal_session_identities(
    state: State<'_, AppState>,
    panes: Vec<crate::session_identity::IdentityRequest>,
) -> Result<Vec<crate::session_identity::SessionIdentity>, String> {
    let manager = Arc::clone(&state.manager);
    super::run_blocking(move || crate::session_identity::identify(&manager, &panes)).await
}
