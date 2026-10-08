//! Save the worktree as it is right now as a private checkpoint.
//!
//! A checkpoint is a commit object holding a tree of the working files, pointed
//! at by `refs/vibyra/checkpoints/<session>/<n>`. It is made with
//! `commit-tree`, so no branch moves, the real index is not read or written,
//! and the stash is untouched. The count and sizes are bounded.
pub use super::checkpoint_list::Checkpoint;
use super::checkpoint_list::{delete, key_for_branch, read, session_ok};
use super::git::git_with;
use super::guard::resolve_linked;
use super::snapshot::snapshot_tree;
use super::ShipError;
use parking_lot::Mutex;
use std::path::{Path, PathBuf};

/// Oldest checkpoints beyond this many per session are dropped.
pub const MAX_CHECKPOINTS: usize = 20;

static BUSY: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

/// Creating and restoring never overlap on one worktree: both read, then
/// rewrite, its files. Held until dropped.
pub(super) struct Claim(PathBuf);

pub(super) fn claim(root: &Path) -> Result<Claim, ShipError> {
    let mut busy = BUSY.lock();
    if busy.iter().any(|p| p == root) {
        return Err(ShipError::new(
            "Another checkpoint action is running. Try again in a moment.",
        ));
    }
    busy.push(root.to_path_buf());
    Ok(Claim(root.to_path_buf()))
}

impl Drop for Claim {
    fn drop(&mut self) {
        BUSY.lock().retain(|p| p != &self.0);
    }
}

const AUTHOR: [(&str, &str); 4] = [
    ("GIT_AUTHOR_NAME", "Vibyra"),
    ("GIT_AUTHOR_EMAIL", "checkpoints@vibyra.app"),
    ("GIT_COMMITTER_NAME", "Vibyra"),
    ("GIT_COMMITTER_EMAIL", "checkpoints@vibyra.app"),
];

fn label_ok(label: &str) -> String {
    let flat: String = label
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    flat.trim().chars().take(100).collect()
}

/// Keeps the newest `MAX_CHECKPOINTS`, never the one being restored from.
pub(super) fn prune(root: &Path, session: &str, keep: Option<u32>) -> Result<(), ShipError> {
    let mut all = read(root, session)?;
    while all.len() > MAX_CHECKPOINTS {
        let at = all.iter().position(|c| Some(c.n) != keep).unwrap_or(0);
        delete(root, &all.remove(at).reference);
    }
    Ok(())
}

pub(super) fn save(
    root: &Path,
    session: &str,
    label: &str,
    keep: Option<u32>,
) -> Result<Checkpoint, ShipError> {
    let tree = snapshot_tree(root)?;
    for _ in 0..3 {
        let existing = read(root, session)?;
        if let Some(last) = existing.last().filter(|c| c.tree == tree) {
            return Ok(last.clone());
        }
        let n = existing.last().map_or(1, |c| c.n + 1);
        let message = format!("Vibyra checkpoint: {}", label_ok(label));
        let commit = String::from_utf8_lossy(&git_with(
            root,
            &[
                "-c",
                "commit.gpgsign=false",
                "commit-tree",
                &tree,
                "-m",
                &message,
            ],
            &AUTHOR,
            None,
        )?)
        .trim()
        .to_string();
        let reference = format!("refs/vibyra/checkpoints/{session}/{n}");
        // The empty old value means "must not exist yet": a racing writer
        // takes the number and this loop tries the next one.
        if git_with(root, &["update-ref", &reference, &commit, ""], &[], None).is_err() {
            continue;
        }
        prune(root, session, keep)?;
        return read(root, session)?
            .into_iter()
            .find(|c| c.n == n)
            .ok_or_else(|| ShipError::new("The checkpoint could not be read back."));
    }
    Err(ShipError::new("Could not save a checkpoint. Try again."))
}

pub fn create_checkpoint(
    project_root: &str,
    worktree_root: &str,
    session: Option<&str>,
    label: &str,
) -> Result<Checkpoint, ShipError> {
    let target = resolve_linked(project_root, worktree_root)?;
    let key = session.map_or_else(|| key_for_branch(&target.branch), str::to_owned);
    if !session_ok(&key) {
        return Err(ShipError::new("That checkpoint session name is not valid."));
    }
    let _busy = claim(&target.root)?;
    save(&target.root, &key, label, None)
}
