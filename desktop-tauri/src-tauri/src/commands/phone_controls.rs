use crate::state::AppState;
use serde_json::Value;
use tauri::State;

/// Whether allowed phones may type into terminals as well as watch them. Only
/// this Mac can turn it on; a phone has no way to ask for it.
#[tauri::command]
pub fn phone_set_typing(state: State<'_, AppState>, enabled: bool) -> Result<Value, String> {
    let signed_in = state.account.token().is_some();
    let mut phone = state.phone.lock();
    phone.set_typing(enabled)?;
    Ok(phone.status(signed_in))
}

/// One-time Mac consent for a paired phone to open project-owned running sites.
#[tauri::command]
pub fn phone_set_preview_auto(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<Value, String> {
    let token = state
        .account
        .token()
        .ok_or("Sign in to allow Website Preview")?;
    state.account.with_token(&token, || {
        let phone = state.phone.lock();
        let status = phone.status(true);
        if status["previewAutoAvailable"] != true
            || !status["devices"]
                .as_array()
                .is_some_and(|devices| devices.iter().any(|device| device["id"] == id))
        {
            return Err("Pair this phone with the Mac first".into());
        }
        state
            .preview_grants
            .as_ref()
            .map_err(Clone::clone)?
            .set_automatic(&id, enabled)?;
        Ok(phone.status(true))
    })?
}

/// Remote access through Vibyra Cloud. Only this Mac can turn it on, it needs
/// the Mac signed in, and only that account's phones can reach it.
#[tauri::command]
pub fn phone_set_remote(state: State<'_, AppState>, enabled: bool) -> Result<Value, String> {
    let signed_in = state.account.token().is_some();
    let mut phone = state.phone.lock();
    phone.set_remote(enabled)?;
    Ok(phone.status(signed_in))
}

#[tauri::command]
pub fn phone_set_notifications(state: State<'_, AppState>, enabled: bool) -> Result<Value, String> {
    let owner = state.account.token();
    if !enabled {
        let mut phone = state.phone.lock();
        phone.set_notifications(false, None)?;
        return Ok(phone.status(owner.is_some()));
    }
    let owner = owner.ok_or("Sign in on this computer first.")?;
    state.account.with_token(&owner, || {
        let mut phone = state.phone.lock();
        phone.set_notifications(true, Some(owner.clone()))?;
        Ok(phone.status(true))
    })?
}

/// Ends every session that came through the cloud, at once.
#[tauri::command]
pub fn phone_remote_disconnect_all(state: State<'_, AppState>) -> Result<Value, String> {
    state.cloud_management.revoke()?;
    let signed_in = state.account.token().is_some();
    let phone = state.phone.lock();
    phone.remote_disconnect_all();
    Ok(phone.status(signed_in))
}
