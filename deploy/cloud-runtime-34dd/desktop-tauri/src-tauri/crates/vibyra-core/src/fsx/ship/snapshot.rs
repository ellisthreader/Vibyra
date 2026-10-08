//! A tree object for the worktree as it is on disk, built in a private index so
//! the branch, the real index and the stash are never touched.
use super::git::{git, git_with, text};
use super::ShipError;
use crate::fsx::git_changes::changes;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_FILE: u64 = 8 * 1024 * 1024;
const MAX_TOTAL: u64 = 64 * 1024 * 1024;
const MAX_FILES: usize = 2_000;

/// A scratch index inside the worktree's own git directory, removed on drop.
pub(super) struct TempIndex(PathBuf);

impl TempIndex {
    pub(super) fn new(root: &Path) -> Result<Self, ShipError> {
        let dir = text(root, &["rev-parse", "--absolute-git-dir"])?;
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        Ok(Self(Path::new(&dir).join(format!(
            "vibyra-checkpoint-{}-{nanos}.idx",
            std::process::id()
        ))))
    }

    pub(super) fn path(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
}

impl Drop for TempIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Refuse a snapshot that would be unreasonable to keep: too many changed
/// files, one huge file, or too many bytes in all.
pub(super) fn check_size(root: &Path) -> Result<(), ShipError> {
    let listed = changes(&root.to_string_lossy())
        .map_err(|_| ShipError::new("The changes could not be read."))?
        .files;
    if listed.len() > MAX_FILES {
        return Err(ShipError::new(
            "Too many files changed to checkpoint safely.",
        ));
    }
    let mut total = 0u64;
    for file in &listed {
        let Ok(meta) = std::fs::symlink_metadata(root.join(&file.path)) else {
            continue;
        };
        if meta.is_file() {
            if meta.len() > MAX_FILE {
                return Err(ShipError::new(format!(
                    "{} is too large to checkpoint (over 8 MB), so no checkpoint was saved.",
                    file.path
                )));
            }
            total += meta.len();
        }
    }
    if total > MAX_TOTAL {
        return Err(ShipError::new(
            "The changes are too large to checkpoint (over 64 MB).",
        ));
    }
    Ok(())
}

pub(super) fn snapshot_tree(root: &Path) -> Result<String, ShipError> {
    check_size(root)?;
    let index = TempIndex::new(root)?;
    let env = [("GIT_INDEX_FILE", index.path())];
    let env: Vec<(&str, &str)> = env.iter().map(|(k, v)| (*k, v.as_str())).collect();
    // An unborn branch has no HEAD to start from; the snapshot is then just
    // what is on disk.
    if git(root, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_ok() {
        git_with(root, &["read-tree", "HEAD"], &env, None)?;
    }
    git_with(root, &["add", "-A"], &env, None)?;
    let tree = git_with(root, &["write-tree"], &env, None)?;
    Ok(String::from_utf8_lossy(&tree).trim().to_string())
}
