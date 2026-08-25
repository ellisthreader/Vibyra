//! What a pane's conversation opened with, so it can be named after the chat.
//!
//! Kept apart from `agent_conversations`, which answers a different question:
//! that module is about whether a conversation can still be resumed, and this
//! one is about what to call it. Sharing a file only made both harder to find.

use std::sync::Arc;

use tauri::State;
use vibyra_core::pty::SessionId;
use vibyra_core::CoreResult;

use super::run_blocking_core;
use crate::state::AppState;

/// The prompt a pane's conversation opened with.
///
/// `Some("")` means the provider keeps a transcript that has no submitted
/// prompt in it yet; `None` means there is no transcript to read, and the
/// caller falls back to watching what is typed. A pane that has already
/// closed simply has nothing to read, which is the same answer.
#[tauri::command]
pub async fn agent_chat_prompt(
    state: State<'_, AppState>,
    id: SessionId,
) -> CoreResult<Option<String>> {
    let manager = Arc::clone(&state.manager);
    run_blocking_core(move || Ok(manager.agent_chat_prompt(id).ok().flatten())).await
}
