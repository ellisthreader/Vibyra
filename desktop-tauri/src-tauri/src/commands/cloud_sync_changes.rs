//! Reviewing what the cloud computer changed in a project: the review, one file's three versions,
//! applying (with a backup) and keeping the Mac's versions. Thin over `cloud_sync_review`.

use super::cloud_guard::CloudSession;
use super::cloud_sync::{project, status_now};
use super::cloud_sync_review::{self as review, ChangeReview};
use super::run_blocking;
use crate::cloud_sync_task::{self as task, Handle, Msg, SyncStatusView};
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn cloud_sync_change_review(
    app: AppHandle,
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    project_id: String,
) -> Result<Option<ChangeReview>, String> {
    let session = CloudSession::capture(&state)?;
    let project = project(&state, &project_id)?;
    let slot = handle.slot.clone();
    run_blocking(move || {
        session.run_engine(&app.state::<AppState>(), &slot, |engine| {
            review::review(engine, &project)
        })
    })
    .await
}

#[tauri::command]
pub async fn cloud_sync_change_file(
    app: AppHandle,
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    project_id: String,
    path: String,
) -> Result<Value, String> {
    let session = CloudSession::capture(&state)?;
    let project = project(&state, &project_id)?;
    let slot = handle.slot.clone();
    run_blocking(move || {
        session.run_engine(&app.state::<AppState>(), &slot, |engine| {
            review::file_review(engine, &project, &path)
        })
    })
    .await
}

#[tauri::command]
pub async fn cloud_sync_change_apply(
    app: AppHandle,
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    project_id: String,
    seq: u64,
    digest: String,
    confirmed: bool,
) -> Result<Value, String> {
    if !confirmed {
        return Err("Review and approve the changes first.".into());
    }
    let session = CloudSession::capture(&state)?;
    let project = project(&state, &project_id)?;
    let backup = task::backup_dir(&app, &project).ok_or("Missing app storage.")?;
    let slot = handle.slot.clone();
    let result = run_blocking(move || {
        session.run_engine(&app.state::<AppState>(), &slot, |engine| {
            review::apply(engine, &project, seq, &digest, &backup)
        })
    })
    .await?;
    handle.send(Msg::FlushDirty);
    Ok(result)
}

/// Keeps the Mac's versions and forgets the cloud's change (it stays in the cloud computer).
#[tauri::command]
pub async fn cloud_sync_change_dismiss(
    app: AppHandle,
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    project_id: String,
    seq: u64,
) -> Result<SyncStatusView, String> {
    let session = CloudSession::capture(&state)?;
    let project = project(&state, &project_id)?;
    let slot = handle.slot.clone();
    run_blocking(move || {
        session.run_engine(&app.state::<AppState>(), &slot, |engine| {
            engine
                .dismiss_cloud_changes(&project, seq)
                .map_err(|e| e.to_string())
        })
    })
    .await?;
    Ok(status_now(&state, &handle))
}
