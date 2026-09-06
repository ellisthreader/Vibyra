//! Paths for account-owned chat files. Never treat a renderer ID as a path.
use std::path::{Path, PathBuf};

use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

pub fn validate_id(id: &str) -> CoreResult<()> {
    if uuid::Uuid::parse_str(id).is_ok_and(|uuid| uuid.to_string() == id) {
        Ok(())
    } else {
        Err(CoreError::InvalidPath("invalid chat identifier".into()))
    }
}

pub fn require_chat(db: &AgentDb, id: &str) -> CoreResult<()> {
    validate_id(id)?;
    let exists: bool = db.with(|connection| {
        connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM agent_chats WHERE id = ?1)",
                [id],
                |row| row.get(0),
            )
            .map_err(sql)
    })?;
    if exists {
        Ok(())
    } else {
        Err(CoreError::InvalidPath("that chat no longer exists".into()))
    }
}

pub fn folder(root: &Path, id: &str) -> CoreResult<PathBuf> {
    folder_at(root, "chats", id)
}

pub(crate) fn folder_at(root: &Path, area: &str, id: &str) -> CoreResult<PathBuf> {
    validate_id(id)?;
    let mut path = std::fs::canonicalize(root)?;
    for part in [area, id] {
        path.push(part);
        match std::fs::symlink_metadata(&path) {
            Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => {
                return Err(CoreError::InvalidPath(
                    "chat storage is not a managed directory".into(),
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(path)
}

pub fn remove_file(root: &Path, id: &str, stored: &str) -> CoreResult<()> {
    let parent = folder(root, id)?;
    let path = Path::new(stored);
    if path.parent() != Some(parent.as_path()) {
        return Err(CoreError::InvalidPath(
            "attachment is outside its managed chat".into(),
        ));
    }
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub fn discard(root: &Path, id: &str) -> CoreResult<()> {
    let path = folder(root, id)?;
    match std::fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}
