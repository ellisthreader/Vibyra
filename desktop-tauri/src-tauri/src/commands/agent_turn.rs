use super::{agent_roster::world, run_blocking};
use crate::{
    agent_mode::turns::{execute, TurnRequest},
    state::AppState,
};
use tauri::{ipc::Channel, State};
use vibyra_core::{agent_chats::ChatEventRow, agent_model::PermissionMode};

/// Runs one turn, streaming its events into `on_event`.
#[tauri::command]
pub async fn agent_turn_send(
    state: State<'_, AppState>,
    chat_id: String,
    prompt: String,
    permission: Option<PermissionMode>,
    account_id: Option<String>,
    on_event: Channel<ChatEventRow>,
) -> Result<vibyra_core::agent_runs::RunOutcome, String> {
    let world = world(&state)?;
    if world.busy().iter().any(|busy| busy == &chat_id) {
        return Err("That chat is already working. Stop it first, or open a new chat.".into());
    }
    run_blocking(move || {
        execute(
            &world,
            TurnRequest {
                chat_id,
                prompt,
                permission,
                occasion_routine: None,
                occasion_handoff: None,
                account_id,
            },
            |row| {
                let _ = on_event.send(row.clone());
            },
        )
    })
    .await
}

/// Stops the turn in one chat. The chat, its transcript and its session id are
/// untouched — only this turn ends.
#[tauri::command]
pub async fn agent_turn_cancel(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<bool, String> {
    Ok(world(&state)?.cancel(&chat_id))
}

/// Which chats are working right now. What the dashboard and the rail badge
/// read, and what survives a webview reload that lost its channels.
#[tauri::command]
pub async fn agent_turn_running(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(world(&state)?.busy())
}
