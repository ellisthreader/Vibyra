//! File tree operations: new file or folder, rename or move, delete to the
//! Trash. Everything stays inside the project root, no folder on a path may be
//! a link (a link itself is moved or trashed as a link, never followed), the
//! project root and anything in `.git` are refused, and nothing is overwritten.

use std::ffi::OsStr;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::links::LinkGuard;
use super::scope::{slash_path, split};
use crate::{CoreError, CoreResult};

const MAX_DEPTH: usize = 32;
const MAX_NAME_BYTES: usize = 255;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Dir,
}

/// Where the entry now is.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Changed {
    pub path: String,
    pub rel_path: String,
}

fn refuse(message: &str) -> CoreError {
    CoreError::InvalidPath(message.into())
}

fn exists(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

/// One plain name: no separators, controls or dot names.
fn check_name(name: &OsStr) -> CoreResult<()> {
    let text = name
        .to_str()
        .ok_or_else(|| refuse("That name is not valid text."))?;
    let bad = text.is_empty()
        || text == "."
        || text == ".."
        || text.len() > MAX_NAME_BYTES
        || text.chars().any(|c| {
            c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        });
    if bad {
        return Err(refuse(
            "Use a plain name without slashes or special characters.",
        ));
    }
    Ok(())
}

fn check_names(rel: &Path) -> CoreResult<()> {
    if rel.components().count() > MAX_DEPTH {
        return Err(refuse("That path is too deep."));
    }
    for part in rel.components() {
        match part {
            Component::Normal(name) => check_name(name)?,
            _ => return Err(refuse("Paths may not contain \"..\".")),
        }
    }
    Ok(())
}

fn changed(canon_root: &Path, full: PathBuf) -> Changed {
    let rel = full.strip_prefix(canon_root).unwrap_or(&full).to_path_buf();
    Changed {
        path: full.to_string_lossy().into_owned(),
        rel_path: slash_path(&rel),
    }
}

/// Creates the file or folder, and any missing folders above it (each one
/// checked as it is made). An existing path is never touched.
pub fn create_entry(root: &Path, path: &str, kind: EntryKind) -> CoreResult<Changed> {
    let (canon_root, rel) = split(root, path)?;
    check_names(&rel)?;
    let parts: Vec<&OsStr> = rel.iter().collect();
    let mut at = canon_root.clone();
    for (index, name) in parts.iter().enumerate() {
        at.push(name);
        let last = index + 1 == parts.len();
        match std::fs::symlink_metadata(&at) {
            Ok(_) if last => return Err(refuse("Something with that name already exists here.")),
            Ok(meta) if meta.is_dir() => {}
            Ok(_) => return Err(refuse("A folder on this path is a file or a link.")),
            Err(_) if last && kind == EntryKind::File => {
                std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&at)?;
            }
            Err(_) => std::fs::create_dir(&at)?,
        }
    }
    Ok(changed(&canon_root, at))
}

/// Renames or moves `from` to `to` (both relative to the root, or absolute and
/// inside it). The destination must not exist, and a folder never moves into
/// itself; only a change of letter case may land on the same entry.
pub fn move_entry(root: &Path, from: &str, to: &str) -> CoreResult<Changed> {
    let (canon_root, from_rel) = split(root, from)?;
    let (_, to_rel) = split(root, to)?;
    check_names(&to_rel)?;
    if from_rel == to_rel {
        return Err(refuse("Nothing to change."));
    }
    if to_rel.starts_with(&from_rel) {
        return Err(refuse("A folder cannot be moved into itself."));
    }
    let mut guard = LinkGuard::new(&canon_root);
    let source = guard.path_of(&from_rel)?;
    if !exists(&source) {
        return Err(refuse("This no longer exists."));
    }
    let target = guard.path_of(&to_rel)?;
    if exists(&target) && source.canonicalize().ok() != target.canonicalize().ok() {
        return Err(refuse("Something with that name already exists there."));
    }
    std::fs::rename(&source, &target)?;
    Ok(changed(&canon_root, target))
}

/// Moves the entry to the Trash through `trash` (the platform's, in the app).
/// A link is trashed as a link; the project root and `.git` are refused.
pub fn delete_entry(
    root: &Path,
    path: &str,
    trash: &dyn Fn(&Path) -> CoreResult<()>,
) -> CoreResult<Changed> {
    let (canon_root, rel) = split(root, path)?;
    let mut guard = LinkGuard::new(&canon_root);
    let target = guard.path_of(&rel)?;
    if !exists(&target) {
        return Err(refuse("This no longer exists."));
    }
    trash(&target)?;
    Ok(changed(&canon_root, target))
}

#[cfg(test)]
#[path = "tree_ops_tests.rs"]
mod tests;
