use crate::phone::workspace::{DesktopPane, DesktopProject};
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use super::run_blocking;

#[tauri::command]
pub fn phone_status(state: State<'_, AppState>) -> Value {
    state.phone.lock().status()
}

#[tauri::command]
pub async fn phone_configure(state: State<'_, AppState>, enabled: bool) -> Result<Value, String> {
    let phone = state.phone.clone();
    let manager = state.manager.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut phone = phone.lock();
        // A failed start still leaves the switch on, so the network watcher can
        // pick it up the moment this Mac joins a usable network.
        let started = if enabled {
            phone.enable(manager)
        } else {
            phone.disable()
        };
        let status = phone.status();
        started.map(|()| status)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Whether allowed phones may type into terminals as well as watch them. Only
/// this Mac can turn it on; a phone has no way to ask for it.
#[tauri::command]
pub fn phone_set_typing(state: State<'_, AppState>, enabled: bool) -> Result<Value, String> {
    let mut phone = state.phone.lock();
    phone.set_typing(enabled)?;
    Ok(phone.status())
}

/// Remote access through Vibyra Cloud. Only this Mac can turn it on, it needs
/// the Mac signed in, and only that account's phones can reach it.
#[tauri::command]
pub fn phone_set_remote(state: State<'_, AppState>, enabled: bool) -> Result<Value, String> {
    let mut phone = state.phone.lock();
    phone.set_remote(enabled)?;
    Ok(phone.status())
}

/// Ends every session that came through the cloud, at once.
#[tauri::command]
pub fn phone_remote_disconnect_all(state: State<'_, AppState>) -> Value {
    let phone = state.phone.lock();
    phone.remote_disconnect_all();
    phone.status()
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
) {
    state.phone.lock().publish(projects, panes, chats);
}

/// Terminals a phone has asked this window to start or close and is waiting
/// on. The window is told of each as it arrives; this is for a window that
/// has just mounted, or missed one.
#[tauri::command]
pub fn phone_terminal_requests(state: State<'_, AppState>) -> Vec<Value> {
    state.phone.lock().requests.pending()
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
    state.phone.lock().host()?.revoke(&id)
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
    let Some(path) = picked else {
        return Ok(state.phone.lock().status());
    };
    let phone = state.phone.clone();
    run_blocking(move || {
        let phone = phone.lock();
        phone.vault.choose(path)?;
        Ok(phone.status())
    })
    .await
}

#[tauri::command]
pub fn phone_vault_clear(state: State<'_, AppState>) -> Result<Value, String> {
    let phone = state.phone.lock();
    phone.vault.clear()?;
    Ok(phone.status())
}
