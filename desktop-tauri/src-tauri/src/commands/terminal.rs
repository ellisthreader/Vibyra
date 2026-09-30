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
use super::terminal_prepare::LaunchContext;
use crate::sink::TermEvent;
use crate::state::AppState;

#[tauri::command]
pub async fn create_terminal(
    state: State<'_, AppState>,
    on_event: Channel<TermEvent>,
    request: CreateTerminalRequest,
) -> Result<SessionInfo, CoreError> {
    let effect = super::phone_effects::PhoneEffect::capture(
        &state,
        request.phone_request_id.as_deref(),
        &["create", "resumeSaved"],
        request.project_id.as_deref(),
        request.saved_pane_id,
    )
    .map_err(CoreError::Settings)?;
    if let Some(effect) = &effect {
        effect
            .terminal(
                &request.agent_id,
                request.cwd.as_deref(),
                request.saved_pane_id,
            )
            .map_err(CoreError::Settings)?;
    }
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
        super::terminal_create_service::create_checked(&manager, request, context, effect)
    })
    .await?;
    state.sink.attach(info.id, on_event);
    Ok(info)
}

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
    request: super::terminal_launch::CreateSshTerminalRequest,
) -> Result<SessionInfo, CoreError> {
    let super::terminal_launch::CreateSshTerminalRequest {
        target,
        rows,
        cols,
        phone_request_id,
        project_id,
        saved_pane_id,
    } = request;
    let effect = super::phone_effects::PhoneEffect::capture(
        &state,
        phone_request_id.as_deref(),
        &["resumeSaved"],
        project_id.as_deref(),
        saved_pane_id,
    )
    .map_err(CoreError::Settings)?;
    if let Some(effect) = &effect {
        effect
            .ssh(&target, saved_pane_id)
            .map_err(CoreError::Settings)?;
    }
    validate_ssh_target(&target)?;
    let mut spec = LaunchSpec::ssh(&target, &[]);
    configure_dimensions(&mut spec, rows, cols)?;
    let info = super::phone_effects::scoped(effect, |_| {
        state.manager.create_session("ssh", &target, &spec)
    })?;
    state.sink.attach(info.id, on_event);
    Ok(info)
}

/// Nonblocking ordered IPC preserves input byte order.
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

/// Synchronous output flow control preserves hold/release order.
#[tauri::command]
pub fn hold_terminal_output(
    state: State<'_, AppState>,
    id: SessionId,
    hold: bool,
) -> Result<(), CoreError> {
    state.manager.hold_output(id, hold)
}

/// Scrollback reads can request a bounded tail; relaunch reads the whole ring.
#[tauri::command]
pub async fn terminal_snapshot(
    state: State<'_, AppState>,
    id: SessionId,
    max_bytes: Option<usize>,
) -> Result<String, CoreError> {
    match max_bytes {
        Some(max) => state.manager.snapshot_tail(id, max),
        None => state.manager.snapshot(id),
    }
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
