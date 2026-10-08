use crate::{sink::TermEvent, state::AppState};
use tauri::{ipc::Channel, State};
use vibyra_core::pty::SessionInfo;

#[tauri::command]
pub async fn shared_cli_attach(
    state: State<'_, AppState>,
    session_id: String,
    rows: u16,
    cols: u16,
    on_event: Channel<TermEvent>,
) -> Result<SessionInfo, String> {
    let chats = state.shared_chats.clone();
    super::run_blocking(move || chats.attach_cli(&session_id, rows, cols, on_event)).await
}
/// Async so the write never runs on the main thread: a synchronous command
/// there froze the whole window while it waited on the terminal.
#[tauri::command]
pub async fn shared_cli_write(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state.shared_chats.cli_write(&session_id, &data)
}
#[tauri::command]
pub fn shared_cli_resize(
    state: State<'_, AppState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state.shared_chats.cli_resize(&session_id, rows, cols)
}
/// `release` carries the channel of a view that is unmounting. Synchronous on
/// purpose: a release has to land before the attach its replacement sends
/// next, and the main thread runs them in order.
#[tauri::command]
pub fn shared_cli_visibility(
    state: State<'_, AppState>,
    session_id: String,
    visible: bool,
    release: Option<u32>,
) -> Result<(), String> {
    match release {
        Some(channel) => state.shared_chats.cli_release(&session_id, channel),
        None => state.shared_chats.cli_visibility(&session_id, visible),
    }
}
