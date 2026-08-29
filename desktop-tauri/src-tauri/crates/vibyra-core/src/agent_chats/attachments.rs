//! Files a user attaches to a chat, and why they are copied rather than linked.
//!
//! A detached Chat Mode conversation has no place and no repository access.
//! Handing the provider the user's original path would quietly undo that: the
//! CLI would be reading a file inside a folder nobody granted, and the next
//! thing it reads could be the one beside it. So an attachment is *copied*
//! into a folder that belongs to the chat, and it is the copy whose path is
//! passed. Detachment survives attaching a screenshot.
//!
//! Deleting the chat deletes the folder, which is the other half: an
//! attachment must not outlive the conversation it was part of.

use std::path::{Path, PathBuf};

use rusqlite::params;
use serde::Serialize;

use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

/// The cap on one attachment. Large enough for a full-resolution screenshot
/// or a long log, small enough that a mistaken drag cannot fill the disk.
pub const MAX_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachment {
    pub id: String,
    pub chat_id: String,
    pub original: String,
    /// The copy inside the chat's own folder — the only path a provider sees.
    pub managed_path: String,
    pub mime: String,
    pub bytes: i64,
}

/// The folder one chat's attachments live in.
pub fn folder(root: &Path, chat_id: &str) -> PathBuf {
    root.join("chats").join(chat_id)
}

/// Copies a file into the chat's folder and records it.
pub fn attach(
    db: &AgentDb,
    root: &Path,
    chat_id: &str,
    source: &str,
) -> CoreResult<ChatAttachment> {
    let from = Path::new(source);
    let metadata = std::fs::metadata(from)
        .map_err(|error| CoreError::InvalidPath(format!("{source}: {error}")))?;
    if !metadata.is_file() {
        return Err(CoreError::InvalidPath(format!("{source} is not a file")));
    }
    if metadata.len() > MAX_BYTES {
        return Err(CoreError::InvalidPath(format!(
            "that file is {} MB; attachments are capped at {} MB",
            metadata.len() / 1_048_576,
            MAX_BYTES / 1_048_576
        )));
    }

    let dir = folder(root, chat_id);
    std::fs::create_dir_all(&dir)?;
    crate::fsx::harden_dir(&dir);

    let id = new_id();
    let original = from
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "attachment".into());
    // Prefixed with the row id so two files called `screenshot.png` are two
    // files, and so a crafted name cannot collide with an existing copy.
    let managed = dir.join(format!("{id}-{}", safe_name(&original)));
    std::fs::copy(from, &managed)?;
    crate::fsx::harden(&managed);

    let record = ChatAttachment {
        id,
        chat_id: chat_id.to_string(),
        original,
        managed_path: managed.to_string_lossy().into_owned(),
        mime: mime_for(&managed),
        bytes: metadata.len() as i64,
    };
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO chat_attachments \
                 (id, chat_id, original, managed_path, mime, bytes, created_ms) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    record.id,
                    record.chat_id,
                    record.original,
                    record.managed_path,
                    record.mime,
                    record.bytes,
                    now_ms(),
                ],
            )
            .map_err(sql)?;
        Ok(())
    })?;
    Ok(record)
}

/// The image paths for a turn — what the adapters pass as `-i`.
pub fn images(db: &AgentDb, chat_id: &str) -> CoreResult<Vec<String>> {
    db.with(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT managed_path FROM chat_attachments \
                 WHERE chat_id = ?1 AND mime LIKE 'image/%' ORDER BY created_ms",
            )
            .map_err(sql)?;
        let rows = statement
            .query_map(params![chat_id], |row| row.get::<_, String>(0))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql)
    })
}

/// Removes a chat's attachment folder. Called when the chat is deleted; the
/// rows go with the chat through the schema's cascade.
pub fn discard(root: &Path, chat_id: &str) {
    let _ = std::fs::remove_dir_all(folder(root, chat_id));
}

/// Strips everything that could make a copied name mean a path.
fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('.').to_string();
    if trimmed.is_empty() {
        "attachment".into()
    } else {
        trimmed.chars().take(80).collect()
    }
}

/// Enough of a MIME guess to tell an image from everything else, which is the
/// only distinction the adapters make.
fn mime_for(path: &Path) -> String {
    let extension = path
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "json" => "application/json",
        "md" | "txt" | "log" => "text/plain",
        _ => "application/octet-stream",
    }
    .into()
}
