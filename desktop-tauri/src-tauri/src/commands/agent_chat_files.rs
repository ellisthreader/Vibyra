//! The files a chat carries: what is attached to it, and what it changed.
//!
//! Split from `agent_chat`, which owns chats and turns. These three are about
//! files on disk, and both of them answer a surface that has to say something
//! honest about what the provider can see.

use std::path::PathBuf;

use tauri::State;
use vibyra_core::agent_chats::attachments::ChatAttachment;

use super::agent_roster::world;
use super::run_blocking;
use crate::state::AppState;

/// Everything attached to one chat.
///
/// The composer reads this on open rather than remembering what it added, so
/// the list survives switching chats — which is the only way it can agree with
/// what the next turn actually hands the provider.
#[tauri::command]
pub async fn agent_chat_attachments(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<Vec<ChatAttachment>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_chats::attachment_store::list(&world.db, &chat_id)
            .map_err(|e| e.to_string())
    })
    .await
}

/// Removes one attachment from a chat, and its copy from the chat's folder.
#[tauri::command]
pub async fn agent_chat_attachment_remove(
    state: State<'_, AppState>,
    chat_id: String,
    attachment_id: String,
) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        let root = world.root.clone();
        vibyra_core::agent_chats::attachment_store::remove(
            &world.db,
            &root,
            &chat_id,
            &attachment_id,
        )
        .map_err(|e| e.to_string())
    })
    .await
}

/// The uncommitted diff of one file an agent changed.
///
/// Authority is resolved here, from the agent's own grants, rather than taken
/// from the webview: a path parameter that diffed anything would be a way to
/// read any file on the machine one hunk at a time. The check is the same
/// `authorize` every turn goes through, asking only for read.
///
/// A detached chat has no grants and therefore no diffs — it also has no
/// folder to change a file in, so this is a refusal that can only be reached
/// by asking for something that did not happen.
#[tauri::command]
pub async fn agent_file_diff(
    state: State<'_, AppState>,
    agent_id: Option<String>,
    path: String,
) -> Result<String, String> {
    let world = world(&state)?;
    let Some(agent_id) = agent_id else {
        return Err("A detached chat has no granted folder to diff against.".into());
    };
    run_blocking(move || {
        let places = vibyra_core::agent_profiles::list_places(&world.db, &agent_id)
            .map_err(|e| e.to_string())?;
        let target = PathBuf::from(&path);
        vibyra_core::agent_profiles::authorize(&places, &target, false)
            .map_err(|e| e.to_string())?;
        vibyra_core::review::uncommitted_file_diff(&target).map_err(|e| e.to_string())
    })
    .await
}
