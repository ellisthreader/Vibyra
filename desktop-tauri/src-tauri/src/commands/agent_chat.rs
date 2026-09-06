//! Commands for chats and the turns inside them.
//!
//! `agent_turn_send` is the one with real shape. It takes a channel and
//! streams normalized events into it as they arrive, exactly as
//! `create_terminal` streams PTY output — the webview never polls, and the
//! transcript on screen is the transcript in the database because both are
//! written from the same loop.

use tauri::State;
use vibyra_core::agent_chats::{transcript, AgentChat, ChatEventRow, NewChat};

use super::agent_roster::world;
use super::run_blocking;
use crate::state::AppState;

#[tauri::command]
pub async fn agent_chat_list(
    state: State<'_, AppState>,
    agent_id: Option<String>,
    archived: Option<bool>,
) -> Result<Vec<AgentChat>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        if archived.unwrap_or(false) {
            return vibyra_core::agent_chats::archived(
                &world.db,
                &world.account,
                agent_id.as_deref(),
            )
            .map_err(|e| e.to_string());
        }
        vibyra_core::agent_chats::list(&world.db, &world.account, agent_id.as_deref())
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_chat_create(
    state: State<'_, AppState>,
    mut request: NewChat,
) -> Result<AgentChat, String> {
    let world = world(&state)?;
    run_blocking(move || {
        if let Some(id) = &request.agent_id {
            let profile = vibyra_core::agent_profiles::get(&world.db, &world.account, id)
                .map_err(|e| e.to_string())?;
            if profile.archived_ms.is_some() {
                return Err("Restore this teammate before creating a chat.".into());
            }
            request.engine = profile.engine;
        }
        vibyra_core::agent_chats::create(&world.db, &world.account, request)
            .map_err(|e| e.to_string())
    })
    .await
}

/// The transcript, most recent page first-loaded. `beforeSeq` pages backwards
/// into a long chat rather than mounting all of it.
#[tauri::command]
pub async fn agent_chat_events(
    state: State<'_, AppState>,
    chat_id: String,
    before_seq: Option<i64>,
    after_seq: Option<i64>,
) -> Result<Vec<ChatEventRow>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_chats::get(&world.db, &world.account, &chat_id)
            .map_err(|e| e.to_string())?;
        if let Some(seq) = after_seq {
            return transcript::since(&world.db, &chat_id, seq).map_err(|e| e.to_string());
        }
        match before_seq {
            Some(seq) => transcript::earlier(&world.db, &chat_id, seq),
            None => transcript::recent(&world.db, &chat_id),
        }
        .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_chat_amend(
    state: State<'_, AppState>,
    chat_id: String,
    title: Option<String>,
    pinned: Option<bool>,
    archived: Option<bool>,
) -> Result<AgentChat, String> {
    let world = world(&state)?;
    run_blocking(move || {
        world.with_idle(&chat_id, || {
            vibyra_core::agent_chats::amend(
                &world.db,
                &world.account,
                &chat_id,
                title.as_deref(),
                pinned,
                archived,
            )
            .map_err(|e| e.to_string())
        })
    })
    .await
}

/// Gives a detached chat one folder, or takes it away again.
#[tauri::command]
pub async fn agent_chat_mount(
    state: State<'_, AppState>,
    chat_id: String,
    path: Option<String>,
) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        world.with_idle(&chat_id, || {
            vibyra_core::agent_chats::mount_place(
                &world.db,
                &world.account,
                &chat_id,
                path.as_deref(),
            )
            .map_err(|e| e.to_string())
        })
    })
    .await
}

#[tauri::command]
pub async fn agent_chat_delete(state: State<'_, AppState>, chat_id: String) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        // The attachment folder goes with the chat: a file copied in for one
        // conversation must not outlive it.
        world.with_idle(&chat_id, || {
            vibyra_core::agent_chats::get(&world.db, &world.account, &chat_id)
                .map_err(|e| e.to_string())?;
            vibyra_core::agent_chats::attachments::discard(&world.root, &chat_id)
                .map_err(|e| e.to_string())?;
            vibyra_core::agent_chats::delete(&world.db, &world.account, &chat_id)
                .map_err(|e| e.to_string())
        })
    })
    .await
}

#[tauri::command]
pub async fn agent_chat_search(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<AgentChat>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_chats::search(&world.db, &world.account, &query)
            .map_err(|e| e.to_string())
    })
    .await
}

/// Copies a file into the chat's own folder and records it.
#[tauri::command]
pub async fn agent_chat_attach(
    state: State<'_, AppState>,
    chat_id: String,
    path: String,
) -> Result<vibyra_core::agent_chats::ChatAttachment, String> {
    let world = world(&state)?;
    run_blocking(move || {
        world.with_idle(&chat_id, || {
            vibyra_core::agent_chats::get(&world.db, &world.account, &chat_id)
                .map_err(|e| e.to_string())?;
            vibyra_core::agent_chats::attachments::attach(&world.db, &world.root, &chat_id, &path)
                .map_err(|e| e.to_string())
        })
    })
    .await
}
