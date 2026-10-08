//! Which files the env manager may touch: regular `.env` / `.env.*` files that
//! sit inside the project root behind real folders only. Links are refused at
//! every step, so a link can never carry a read or a write out of the project.

use std::path::{Component, Path, PathBuf};

use crate::{CoreError, CoreResult};

/// Env files larger than this are listed but not opened.
pub const MAX_BYTES: u64 = 256 * 1024;

fn refuse(message: &str) -> CoreError {
    CoreError::InvalidPath(message.into())
}

pub fn is_env_name(name: &str) -> bool {
    name == ".env" || (name.starts_with(".env.") && name.len() > 5 && !name.ends_with('.'))
}

/// The absolute path of `rel` (relative to `root`, `/`-separated) once it is
/// known to be an env file reached through real folders.
pub fn checked_file(root: &Path, rel: &str) -> CoreResult<PathBuf> {
    let canon = root
        .canonicalize()
        .map_err(|_| refuse("This folder no longer exists."))?;
    let rel_path = Path::new(rel);
    let mut at = canon.clone();
    let parts: Vec<_> = rel_path.components().collect();
    if parts.is_empty() || rel.contains('\0') {
        return Err(refuse("Choose an env file."));
    }
    for (index, part) in parts.iter().enumerate() {
        let Component::Normal(name) = part else {
            return Err(refuse(
                "Env files are named relative to the project folder.",
            ));
        };
        at.push(name);
        let meta =
            std::fs::symlink_metadata(&at).map_err(|_| refuse("This file no longer exists."))?;
        if meta.file_type().is_symlink() {
            return Err(refuse("Links are never followed here."));
        }
        let last = index + 1 == parts.len();
        if last && !meta.is_file() {
            return Err(refuse("This is not a file."));
        }
        if !last && !meta.is_dir() {
            return Err(refuse("A folder on this path is a file."));
        }
        if last && !is_env_name(&name.to_string_lossy()) {
            return Err(refuse("Only .env files can be opened here."));
        }
    }
    Ok(at)
}
