use super::{create, CloudLogins};
use crate::{
    cloud_sync_task::Handle, commands::cloud_management_guard::ManagementSession, state::AppState,
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
use vibyra_sync::LoginOutcome;

pub(super) fn login(
    app: &AppHandle,
    logins: &CloudLogins,
    session: &ManagementSession,
    id: &'static str,
    generation: u64,
    cancel: &AtomicBool,
) -> Result<&'static str, String> {
    let state = app.state::<AppState>();
    session.check(&state)?;
    let handle = app.state::<Handle>();
    let engine = handle
        .slot
        .engine(
            &session.token,
            &crate::account_api::base_url(),
            crate::account_api::app_version(),
        )
        .map_err(|e| e.to_string())?;
    session.validate_provider(&state, id)?;
    let (_, key_ready) = engine.cloud_login(id).map_err(|e| e.to_string())?;
    session.check(&state)?;
    if !key_ready {
        return Ok("waitingForCloud");
    }
    let interrupted = || cancel.load(Ordering::SeqCst) || session.check(&state).is_err();
    if interrupted() {
        return Err("Cloud sign-in was stopped.".into());
    }
    logins.set(app, session, generation, id, "allowing", None);
    let artifact = create::create(id, &interrupted)?;
    if interrupted() {
        return Err("Cloud sign-in was stopped.".into());
    }
    session.validate_provider(&state, id)?;
    let (_, key_ready) = engine.cloud_login(id).map_err(|e| e.to_string())?;
    if !key_ready {
        return Ok("waitingForCloud");
    }
    if interrupted() {
        return Err("Cloud sign-in was stopped.".into());
    }
    logins.set(app, session, generation, id, "sending", None);
    match engine
        .send_cloud_login(id, &artifact)
        .map_err(|e| e.to_string())?
    {
        LoginOutcome::Sent { .. } => Ok("done"),
        LoginOutcome::WaitingForCloud => Ok("waitingForCloud"),
        _ => Ok("ready"),
    }
}
