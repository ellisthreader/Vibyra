//! The iOS Cloud endpoints, exposed with fixed paths and account/socket-bound UI admission.
use super::cloud_guard::{mutation, CloudSession};
use crate::account_api::{error_detail, request, request_raw, Endpoint};
use crate::cloud_sync_task::{settings_io, Handle, Msg};
use crate::state::AppState;
use serde::Serialize;
use serde_json::Value;
#[path = "cloud_page_request.rs"]
mod actions;
use actions::action_request;
pub use actions::CloudAction;
use tauri::State;

#[derive(Serialize)]
pub struct CloudOverview {
    /// Existing API envelopes, containing public status only, never login artifacts.
    pub computer: Value,
    pub access: Value,
}

pub(crate) async fn read(
    state: &AppState,
    session: &CloudSession,
) -> Result<CloudOverview, String> {
    session.check(state)?;
    let expected = state.cloud_management.current();
    let overview = fetch(&session.token).await?;
    session.check(state)?;
    super::cloud_management_guard::remember(state, session, &overview, expected.as_ref()).await?;
    Ok(overview)
}

pub(crate) async fn fetch(token: &str) -> Result<CloudOverview, String> {
    let (computer, access) = tokio::try_join!(
        request(Endpoint::CloudComputer, Some(token), None),
        request(Endpoint::CloudComputerAccess, Some(token), None),
    )
    .map_err(|error| error.message().to_owned())?;
    Ok(CloudOverview { computer, access })
}

#[tauri::command]
pub async fn cloud_overview(state: State<'_, AppState>) -> Result<CloudOverview, String> {
    let session = super::cloud_management_guard::ManagementSession::capture(&state)?;
    session.read(&state).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn cloud_page_action(
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    logins: State<'_, std::sync::Arc<crate::cloud_logins::CloudLogins>>,
    action: CloudAction,
    project_key: Option<String>,
    provider: Option<String>,
    enabled: Option<bool>,
    confirmed: Option<bool>,
    name: Option<String>,
) -> Result<CloudOverview, String> {
    let session = super::cloud_management_guard::ManagementSession::capture(&state)?;
    let _mutation = mutation()?;
    session.read(&state).await?;
    let expected = state.cloud_management.current();
    let (endpoint, body) = action_request(
        &action,
        project_key.as_deref(),
        provider.as_deref(),
        enabled,
        confirmed.unwrap_or(false),
        name.as_deref(),
    )?;
    session.check(&state)?;
    let (status, value) = request_raw(endpoint, Some(&session.token), body)
        .await
        .map_err(|error| error.message().to_owned())?;
    if !actions::accepted(&action, status, &value) {
        return Err(error_detail(&value, status));
    }
    // An accepted request still belongs to its original account if the phone went away.
    state
        .account
        .with_authority(&session.token, session.epoch, || ())?;
    if action == CloudAction::Disconnect {
        state
            .account
            .with_authority(&session.token, session.epoch, || {
                if state.cloud_management.revoke_matching(expected.as_ref())? {
                    Ok(())
                } else {
                    Err(super::cloud_guard::PHONE_REQUIRED.to_owned())
                }
            })??;
        logins.stop(&session.token, session.epoch);
        settings_io::update_for_authority(&state, &session.token, session.epoch, |sync| {
            sync.set_paused(true);
            sync.consent_version = 0;
            sync.share_codex_login = false;
        })?;
        handle.reconfigure();
    } else if action == CloudAction::Project {
        let id = state
            .settings
            .lock()
            .projects
            .iter()
            .find(|p| Some(vibyra_sync::project_key(&p.id)).as_ref() == project_key.as_ref())
            .map(|p| p.id.clone());
        if let Some(id) = id {
            settings_io::update_for_authority(&state, &session.token, session.epoch, |s| {
                s.set_project(&id, enabled.unwrap_or(false))
            })?;
        }
        handle.reconfigure();
    } else if action == CloudAction::Repair {
        handle.send(Msg::SyncNow(None));
    }
    if action == CloudAction::Disconnect {
        let overview = fetch(&session.token).await?;
        state
            .account
            .with_authority(&session.token, session.epoch, || ())?;
        Ok(overview)
    } else {
        session.read(&state).await
    }
}

#[cfg(test)]
#[path = "cloud_page_tests.rs"]
mod tests;
