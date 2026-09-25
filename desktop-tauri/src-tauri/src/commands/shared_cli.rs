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
/// Keep key writes in Tauri's ordered IPC dispatch, as `write_terminal` does.
/// `cli_write` only queues bytes to the PTY writer thread; it never waits for
/// the child to read them. An async command could schedule separate keys out
/// of order, even though the webview posted them in order.
#[tauri::command]
pub fn shared_cli_write(
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
