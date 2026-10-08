//! Local sync status and explicit options for the Cloud page. Account connection,
//! lifecycle and deletion use `cloud_page`; pairing never invokes these commands.

use super::cloud_guard::mutation;
use crate::cloud_sync_task::{self as task, settings_io, Handle, Msg, SyncStatusView};
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;
use vibyra_sync::{state::Store, ProjectRef};

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct OptionsPatch {
    /// The old switch, read as "not paused" (older windows still send it).
    pub enabled: Option<bool>,
    pub include_conversations: Option<bool>,
    pub include_env: Option<bool>,
    pub auto_apply_safe: Option<bool>,
}

pub(super) fn status_now(state: &AppState, handle: &Handle) -> SyncStatusView {
    let store = Store::new(handle.slot.state_dir());
    let settings = state.settings.lock().clone();
    task::build_status(
        &settings,
        state.account.token().is_some(),
        &handle.board.lock(),
        &store,
    )
}

pub(super) fn project(state: &AppState, id: &str) -> Result<ProjectRef, String> {
    let spec = state
        .settings
        .lock()
        .projects
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or("Open this project on your Mac first.")?;
    task::resolved(&ProjectRef {
        id: spec.id,
        name: spec.name,
        root: spec.root.into(),
    })
}

#[tauri::command]
pub async fn cloud_sync_status(
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
) -> Result<SyncStatusView, String> {
    let (state, handle) = (state.inner(), handle.inner());
    Ok(status_now(state, handle))
}

#[tauri::command]
pub async fn cloud_sync_set_options(
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    options: OptionsPatch,
) -> Result<SyncStatusView, String> {
    let session = super::cloud_management_guard::ManagementSession::capture(&state)?;
    let _mutation = mutation()?;
    session.read(&state).await?;
    settings_io::update_for_authority(&state, &session.token, session.epoch, |s| {
        if let Some(on) = options.enabled {
            s.set_paused(!on);
        }
        s.include_conversations = options
            .include_conversations
            .unwrap_or(s.include_conversations);
        s.include_env = options.include_env.unwrap_or(s.include_env);
        s.auto_apply_safe = options.auto_apply_safe.unwrap_or(s.auto_apply_safe);
    })?;
    handle.reconfigure();
    if options.include_env.is_some() || options.include_conversations.is_some() {
        handle.send(Msg::SyncNow(None));
    }
    Ok(status_now(&state, &handle))
}

/// "Pause syncing on this Mac": the one opt-out while the account is connected. Lifting it syncs the ticked
/// projects again at once; nothing in the cloud is deleted either way.
#[tauri::command]
pub async fn cloud_sync_set_paused(
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    paused: bool,
) -> Result<SyncStatusView, String> {
    let session = super::cloud_management_guard::ManagementSession::capture(&state)?;
    let _mutation = mutation()?;
    session.read(&state).await?;
    settings_io::update_for_authority(&state, &session.token, session.epoch, |s| {
        s.set_paused(paused)
    })?;
    handle.reconfigure();
    if !paused {
        handle.send(Msg::SyncNow(None));
    }
    Ok(status_now(&state, &handle))
}

#[tauri::command]
pub async fn cloud_sync_now(
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    project_id: Option<String>,
) -> Result<(), String> {
    let session = super::cloud_management_guard::ManagementSession::capture(&state)?;
    session.read(&state).await?;
    session.check(&state)?;
    handle.send(Msg::SyncNow(project_id));
    Ok(())
}
