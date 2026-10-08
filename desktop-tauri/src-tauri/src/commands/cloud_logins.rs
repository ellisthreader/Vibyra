//! Cloud-owned provider sign-ins. Only explicit Allow can open the provider CLI.
use super::cloud_management_guard::ManagementSession;
use crate::cloud_logins::{CloudLogins, ProviderView};
use crate::state::AppState;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn cloud_logins_status(
    state: State<'_, AppState>,
    logins: State<'_, Arc<CloudLogins>>,
) -> Result<Vec<ProviderView>, String> {
    let session = ManagementSession::capture(&state)?;
    Ok(logins.views(&session.token, session.epoch))
}

#[tauri::command]
pub async fn cloud_logins_allow(
    app: AppHandle,
    state: State<'_, AppState>,
    logins: State<'_, Arc<CloudLogins>>,
    provider: String,
) -> Result<Vec<ProviderView>, String> {
    if !matches!(provider.as_str(), "claude" | "codex") {
        return Err("Choose Claude or Codex.".into());
    }
    let session = ManagementSession::capture(&state)?;
    let _mutation = super::cloud_guard::mutation()?;
    let overview = session.read(&state).await?;
    if overview.computer["connected"] != true {
        return Err("Connect to Vibyra Cloud before signing in.".into());
    }
    if overview.access["providers"][&provider]["enabled"] != true {
        return Err("Turn this account on for Vibyra Cloud first.".into());
    }
    // A successful strict overview may have minted existing-management authority.
    let session = ManagementSession::capture(&state)?;
    logins.start(app, session.clone(), &provider)?;
    Ok(logins.views(&session.token, session.epoch))
}

#[tauri::command]
pub fn cloud_logins_stop(
    state: State<'_, AppState>,
    logins: State<'_, Arc<CloudLogins>>,
) -> Result<Vec<ProviderView>, String> {
    let session = ManagementSession::capture(&state)?;
    Ok(logins.stop(&session.token, session.epoch))
}
