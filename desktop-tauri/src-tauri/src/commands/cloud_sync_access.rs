//! Project selection and returned-change receipts from the dedicated Cloud page.
use super::cloud_guard::{mutation, CloudSession};
use super::run_blocking;
use crate::account_api::{error_detail, request_raw, Endpoint};
use crate::cloud_sync_task::{self as task, settings_io, Handle, Msg, SyncStatusView};
use crate::state::AppState;
use serde_json::json;
use tauri::{AppHandle, State};
use vibyra_sync::ProjectRef;

fn spec(state: &AppState, id: &str) -> Result<ProjectRef, String> {
    let spec = state
        .settings
        .lock()
        .projects
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or("Open this project on your Mac first.")?;
    Ok(ProjectRef {
        id: spec.id,
        name: spec.name,
        root: spec.root.into(),
    })
}

#[tauri::command]
pub async fn cloud_sync_set_project(
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    project_id: String,
    enabled: bool,
) -> Result<SyncStatusView, String> {
    let session = CloudSession::capture(&state)?;
    let _mutation = mutation()?;
    let project = spec(&state, &project_id)?;
    let body = json!({"source":"mac", "projects":[{"id":project.id,"name":project.name,"allowed":enabled}]});
    session.check(&state)?;
    let (status, value) = request_raw(
        Endpoint::CloudComputerProjects,
        Some(&session.token),
        Some(body),
    )
    .await
    .map_err(|e| e.message().to_owned())?;
    if !(200..300).contains(&status) {
        return Err(error_detail(&value, status));
    }
    settings_io::update_for_authority(&state, &session.token, session.epoch, |s| {
        s.set_project(&project_id, enabled)
    })?;
    if !enabled {
        task::Tracked::new(handle.slot.state_dir()).forget(&project);
    }
    handle.reconfigure();
    if enabled {
        handle.send(Msg::SyncNow(Some(project_id)));
    }
    session.check(&state)?;
    Ok(super::cloud_sync::status_now(&state, &handle))
}

/// The "N conversations continued in Vibyra Cloud" notice was seen for this project.
#[tauri::command]
pub async fn cloud_sync_returned_seen(
    app: AppHandle,
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    project_id: String,
) -> Result<SyncStatusView, String> {
    let session = CloudSession::capture(&state)?;
    let project = spec(&state, &project_id)?;
    let slot = handle.slot.clone();
    run_blocking(move || {
        use tauri::Manager;
        session.run_engine(&app.state::<AppState>(), &slot, |engine| {
            engine.dismiss_returned(&project).map_err(|e| e.to_string())
        })
    })
    .await?;
    Ok(super::cloud_sync::status_now(&state, &handle))
}
