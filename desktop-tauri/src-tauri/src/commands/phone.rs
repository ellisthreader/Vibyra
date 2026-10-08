use crate::phone::workspace::{DesktopPane, DesktopProject};
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use super::run_blocking;

/// Polled every two seconds, so it waits for the connection lock off the main
/// thread: a rebind holds that lock while the old listener shuts down.
#[tauri::command]
pub async fn phone_status(state: State<'_, AppState>) -> Result<Value, String> {
    let signed_in = state.account.token().is_some();
    let mut status = state.phone.lock().status(signed_in);
    status["cloudManagement"] =
        serde_json::json!(super::cloud_management_guard::availability(&state));
    Ok(status)
}

#[tauri::command]
pub async fn phone_configure(state: State<'_, AppState>, enabled: bool) -> Result<Value, String> {
    if !enabled {
        state.cloud_management.revoke()?;
    }
    let phone = state.phone.clone();
    let manager = state.manager.clone();
    let account = state.account.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let signed_in = account.token().is_some();
        let mut phone = phone.lock();
        // A failed start still leaves the switch on, so the network watcher can
        // pick it up the moment this Mac joins a usable network.
        let started = if enabled {
            phone.enable(manager)
        } else {
            phone.disable()
        };
        let status = phone.status(signed_in);
        started.map(|()| status)
    })
    .await
    .map_err(|e| e.to_string())?;
    // Final clear after stopping the Host fences a receipt minted during shutdown admission.
    if !enabled {
        state.cloud_management.revoke()?;
    }
    result
}

/// The window republishes its projects and panes whenever either changes, so a
/// connected phone lists the same folders under the same names instead of one
/// invented bucket. Rust cannot work this out from a PTY's launch folder.
#[tauri::command]
pub fn phone_publish_workspace(
    state: State<'_, AppState>,
    projects: Vec<DesktopProject>,
    panes: Vec<DesktopPane>,
    chats: Option<Vec<String>>,
    saved: Option<Vec<crate::phone::saved::SavedPane>>,
    chat_titles: Option<std::collections::HashMap<String, String>>,
) {
    let phone = state.phone.lock();
    phone.publish_saved(saved.unwrap_or_default());
    phone.publish_chat_titles(chat_titles.unwrap_or_default());
    phone.publish(projects, panes, chats);
}

/// Terminals a phone has asked this window to start or close and is waiting
/// on. The window is told of each as it arrives; this is for a window that
/// has just mounted, or missed one.
#[tauri::command]
pub async fn phone_terminal_requests(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let requests = state.phone.lock().requests.clone();
    Ok(requests.pending())
}

/// The window's answer to one of those: `{paneId}` or `{conversationId}` for
/// a start, `{ok:true}` for a close, or the reason it could not.
#[tauri::command]
pub fn phone_terminal_reply(
    state: State<'_, AppState>,
    id: String,
    result: Option<Value>,
    error: Option<String>,
) -> bool {
    let answer = match (result, error) {
        (_, Some(error)) => Err(error),
        (Some(result), None) => Ok(result),
        (None, None) => Err("The window gave no answer".into()),
    };
    state.phone.lock().requests.reply(&id, answer)
}

#[tauri::command]
pub fn phone_invite(state: State<'_, AppState>) -> Result<String, String> {
    let phone = state.phone.lock();
    phone
        .host()?
        .invite(&crate::phone::address::pairing_url(phone.address())?)
}

#[tauri::command]
pub fn phone_answer(state: State<'_, AppState>, id: String, approve: bool) -> Result<(), String> {
    state.phone.lock().host()?.answer(&id, approve)
}

#[tauri::command]
pub fn phone_revoke(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.cloud_management.revoke()?;
    state.phone.lock().host()?.revoke(&id)?;
    if let Ok(grants) = &state.preview_grants {
        grants.revoke_device(&id)?;
    }
    Ok(())
}

/// Ends one phone's live connection without forgetting it: it stays allowed
/// and can reconnect on its own. Remove is `phone_revoke`.
#[tauri::command]
pub fn phone_disconnect_device(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.cloud_management.revoke()?;
    state.phone.lock().host()?.disconnect(&id)
}

/// A folder this Mac reads out to its phone, read-only, whether or not the
/// iPhone connection is currently on - choosing it does not itself turn
/// anything on, the way `phone_configure` does.
#[tauri::command]
pub async fn phone_vault_choose(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let picked = run_blocking(move || {
        Ok(app
            .dialog()
            .file()
            .set_title("Choose a vault folder")
            .blocking_pick_folder()
            .and_then(|path| path.into_path().ok()))
    })
    .await?;
    let signed_in = state.account.token().is_some();
    let Some(path) = picked else {
        return Ok(state.phone.lock().status(signed_in));
    };
    let phone = state.phone.clone();
    run_blocking(move || {
        let phone = phone.lock();
        phone.vault.choose(path)?;
        Ok(phone.status(signed_in))
    })
    .await
}

#[tauri::command]
pub fn phone_vault_clear(state: State<'_, AppState>) -> Result<Value, String> {
    let signed_in = state.account.token().is_some();
    let phone = state.phone.lock();
    phone.vault.clear()?;
    Ok(phone.status(signed_in))
}
