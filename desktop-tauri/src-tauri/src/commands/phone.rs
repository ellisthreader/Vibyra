use crate::state::AppState;
use serde_json::Value;
use tauri::State;

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
