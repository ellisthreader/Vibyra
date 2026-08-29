//! The small changes a user makes to a chat that already exists.
//!
//! `mount_place` is the one with teeth: it canonicalises before it writes, and
//! the composer reads the result back — a chat that has mounted a folder is no
//! longer detached and has to stop saying it is.

use rusqlite::params;

use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;

use super::record::AgentChat;
use super::store::get_in;

/// Renames, pins, mounts a place, or archives — the small edits, one call.
pub fn amend(
    db: &AgentDb,
    account: &str,
    id: &str,
    title: Option<&str>,
    pinned: Option<bool>,
    archived: Option<bool>,
) -> CoreResult<AgentChat> {
    db.transact(|connection| {
        let mut chat = get_in(connection, account, id)?;
        if let Some(title) = title {
            chat.title = title.trim().chars().take(120).collect();
        }
        if let Some(pinned) = pinned {
            chat.pinned = pinned;
        }
        if let Some(archived) = archived {
            chat.archived_ms = archived.then(now_ms);
        }
        chat.updated_ms = now_ms();
        connection
            .execute(
                "UPDATE agent_chats SET title = ?1, pinned = ?2, archived_ms = ?3, updated_ms = ?4 \
                 WHERE id = ?5 AND account = ?6",
                params![
                    chat.title,
                    chat.pinned as i64,
                    chat.archived_ms,
                    chat.updated_ms,
                    id,
                    account
                ],
            )
            .map_err(sql)?;
        Ok(chat)
    })
}

/// Gives a detached chat one folder, or takes it away again.
///
/// The composer reads this back: a chat that has mounted a place is no longer
/// detached, and must stop saying it is.
pub fn mount_place(db: &AgentDb, account: &str, id: &str, path: Option<&str>) -> CoreResult<()> {
    let canonical = match path {
        Some(path) => Some(
            crate::agent_profiles::canonical_place(path)?
                .to_string_lossy()
                .into_owned(),
        ),
        None => None,
    };
    db.with(|connection| {
        connection
            .execute(
                "UPDATE agent_chats SET mounted_place = ?1, updated_ms = ?2 \
                 WHERE id = ?3 AND account = ?4",
                params![canonical, now_ms(), id, account],
            )
            .map_err(sql)?;
        Ok(())
    })
}
