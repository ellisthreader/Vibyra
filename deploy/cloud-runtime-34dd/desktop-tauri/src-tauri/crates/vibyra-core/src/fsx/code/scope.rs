//! Keeps every code-view path inside the folder it was opened from.

use std::path::{Component, Path, PathBuf};

use crate::{CoreError, CoreResult};

fn refuse(message: &str) -> CoreError {
    CoreError::InvalidPath(message.into())
}

fn outside() -> CoreError {
    refuse("This file is outside the project folder.")
}

/// No `..`, and nothing inside a `.git` folder (any case: macOS folds it).
fn check_components(path: &Path) -> CoreResult<()> {
    for part in path.components() {
        match part {
            Component::ParentDir => return Err(refuse("Paths may not contain \"..\".")),
            Component::Normal(name) if name.eq_ignore_ascii_case(".git") => {
                return Err(refuse("Files inside .git can't be opened here."))
            }
            _ => {}
        }
    }
    Ok(())
}

/// The canonical root and the requested path relative to it, checked
/// lexically only: the file itself need not exist.
pub(super) fn split(root: &Path, path: &str) -> CoreResult<(PathBuf, PathBuf)> {
    if path.is_empty() || path.contains('\0') {
        return Err(refuse("Choose a file."));
    }
    let canon_root = root
        .canonicalize()
        .map_err(|_| refuse("This folder no longer exists."))?;
    let raw = Path::new(path);
    check_components(raw)?;
    let rel: PathBuf = if raw.is_absolute() {
        if let Ok(rel) = raw.strip_prefix(&canon_root) {
            rel.into()
        } else if let Ok(rel) = raw.strip_prefix(root) {
            rel.into()
        } else {
            let canon = raw.canonicalize().map_err(|_| outside())?;
            canon
                .strip_prefix(&canon_root)
                .map_err(|_| outside())?
                .into()
        }
    } else {
        raw.components()
            .filter(|part| !matches!(part, Component::CurDir))
            .collect()
    };
    check_components(&rel)?;
    if rel.as_os_str().is_empty() {
        return Err(refuse("Choose a file."));
    }
    Ok((canon_root, rel))
}

/// A canonical path is inside the canonical root and not inside `.git`.
fn inside(canon_root: &Path, canon: &Path) -> CoreResult<()> {
    check_components(canon.strip_prefix(canon_root).map_err(|_| outside())?)
}

/// The canonical root and the canonical file. Reads need an existing regular
/// file; a write may name a new file in an existing folder inside the root.
pub(super) fn resolve(root: &Path, path: &str, for_write: bool) -> CoreResult<(PathBuf, PathBuf)> {
    let (canon_root, rel) = split(root, path)?;
    let joined = canon_root.join(&rel);
    if std::fs::symlink_metadata(&joined).is_ok() {
        let canon = joined
            .canonicalize()
            .map_err(|_| refuse("This file points somewhere that no longer exists."))?;
        inside(&canon_root, &canon)?;
        if !canon.is_file() {
            return Err(refuse("This is not a file."));
        }
        return Ok((canon_root, canon));
    }
    if !for_write {
        return Err(refuse("This file no longer exists."));
    }
    let name = joined.file_name().ok_or_else(|| refuse("Choose a file."))?;
    let parent = joined
        .parent()
        .and_then(|parent| parent.canonicalize().ok())
        .ok_or_else(|| refuse("The folder for this file no longer exists."))?;
    inside(&canon_root, &parent)?;
    let file = parent.join(name);
    Ok((canon_root, file))
}

/// Resolves `path` (absolute, or relative to `root`) to a canonical path
/// inside the canonical `root`, refusing `..`, `.git` and symlink escapes.
pub fn resolve_in_root(root: &Path, path: &str, for_write: bool) -> CoreResult<PathBuf> {
    resolve(root, path, for_write).map(|(_, file)| file)
}

/// `path` relative to `root`, joined with '/'.
pub(super) fn slash_path(path: &Path) -> String {
    path.components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
#[path = "scope_tests.rs"]
mod tests;
