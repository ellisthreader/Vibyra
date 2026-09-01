//! Reading and removing a chat's attachments.
//!
//! Split from `attachments`, which owns the policy — why a file is copied in
//! rather than linked, and what that copy is allowed to be. This is the
//! persistence half: what the chat holds now, and taking one back out.
//!
//! The composer needs this because an attachment belongs to the chat, not to
//! the moment it was added. Held only in the view that added it, the list
//! disappeared the first time someone opened another chat, while the files
//! stayed in the folder and stayed on every following turn — the surface
//! disagreeing with the runtime about what the provider could see.

use std::path::Path;

use rusqlite::params;

use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::attachments::{folder, ChatAttachment};

/// Everything attached to one chat, oldest first.
pub fn list(db: &AgentDb, chat_id: &str) -> CoreResult<Vec<ChatAttachment>> {
    db.with(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT id, chat_id, original, managed_path, mime, bytes \
                 FROM chat_attachments WHERE chat_id = ?1 ORDER BY created_ms",
            )
            .map_err(sql)?;
        let rows = statement
            .query_map(params![chat_id], |row| {
                Ok(ChatAttachment {
                    id: row.get(0)?,
                    chat_id: row.get(1)?,
                    original: row.get(2)?,
                    managed_path: row.get(3)?,
                    mime: row.get(4)?,
                    bytes: row.get(5)?,
                })
            })
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql)
    })
}

/// Takes one attachment back out: its row, and the copy it named.
///
/// The row is read before it is deleted so the copy can be removed by the
/// path the database recorded rather than one rebuilt from the original name
/// — `attach` sanitises names on the way in, so rebuilding would miss any
/// file whose name needed cleaning and leave it behind for the provider.
///
/// The delete is scoped by `chat_id` as well as `id`, so an id from one chat
/// can never remove another chat's file.
pub fn remove(db: &AgentDb, root: &Path, chat_id: &str, id: &str) -> CoreResult<()> {
    let managed: String = db.with(|connection| {
        connection
            .query_row(
                "SELECT managed_path FROM chat_attachments WHERE id = ?1 AND chat_id = ?2",
                params![id, chat_id],
                |row| row.get(0),
            )
            .map_err(|_| CoreError::InvalidPath("that attachment is not on this chat".into()))
    })?;
    db.with(|connection| {
        connection
            .execute(
                "DELETE FROM chat_attachments WHERE id = ?1 AND chat_id = ?2",
                params![id, chat_id],
            )
            .map_err(sql)?;
        Ok(())
    })?;
    // Only inside the chat's own folder, whatever the stored path says: a row
    // is not a capability to delete an arbitrary file.
    let copy = Path::new(&managed);
    if copy.starts_with(folder(root, chat_id)) {
        let _ = std::fs::remove_file(copy);
    }
    Ok(())
}
