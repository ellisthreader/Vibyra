//! Put the worktree's files back to a checkpoint, undoably.
//!
//! Restore first saves the current state as a checkpoint of its own, so going
//! back is itself something you can go back from. It changes only files that
//! differ between the two trees, only below the worktree, never follows a
//! link out of it, and leaves the branch, the index and the stash alone. If
//! anything changed on disk between looking and writing (an agent still
//! working), it changes nothing.
use super::checkpoint::{claim, save};
use super::checkpoint_list::{key_for_branch, read, session_ok, Checkpoint};
use super::git::{git, git_with};
use super::guard::resolve_linked;
use super::snapshot::{snapshot_tree, TempIndex};
use super::ShipError;
use serde::Serialize;
use std::path::{Component, Path};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub restored: u32,
    /// The state from before the restore, kept as its own checkpoint.
    pub safety: Option<Checkpoint>,
    pub changed: usize,
}

/// A path from a tree, accepted only if it stays inside the worktree.
fn safe_relative(path: &str) -> bool {
    let p = Path::new(path);
    !path.is_empty()
        && !p.is_absolute()
        && p.components().all(|c| match c {
            Component::Normal(name) => !name.to_string_lossy().eq_ignore_ascii_case(".git"),
            _ => false,
        })
}

fn differences(root: &Path, from: &str, to: &str) -> Result<Vec<(char, String)>, ShipError> {
    let raw = git(
        root,
        &["diff-tree", "-r", "-z", "--no-renames", "--raw", from, to],
    )?;
    let text = String::from_utf8_lossy(&raw).into_owned();
    let mut tokens = text.split('\0').filter(|t| !t.is_empty());
    let mut found = Vec::new();
    while let Some(header) = tokens.next() {
        let status = header.rsplit(' ').next().and_then(|s| s.chars().next());
        let (Some(status), Some(path)) = (status, tokens.next()) else {
            break;
        };
        if !safe_relative(path) {
            return Err(ShipError::new(
                "A checkpoint holds a path outside this worktree, so nothing was changed.",
            ));
        }
        found.push((status, path.to_owned()));
    }
    Ok(found)
}

/// Delete a file and any directories that leave empty, never above `root`.
fn remove_file(root: &Path, relative: &str) -> Result<(), ShipError> {
    let full = root.join(relative);
    // A leading directory that is a link could lead anywhere: leave it alone.
    let inside = full
        .parent()
        .and_then(|p| p.canonicalize().ok())
        .zip(root.canonicalize().ok())
        .is_some_and(|(parent, base)| parent.starts_with(base));
    if !inside {
        return Ok(());
    }
    match std::fs::symlink_metadata(&full) {
        Ok(meta) if meta.is_file() || meta.file_type().is_symlink() => {
            std::fs::remove_file(&full)
                .map_err(|e| ShipError::new(format!("Could not remove {relative}: {e}")))?;
        }
        _ => return Ok(()),
    }
    let mut parent = full.parent();
    while let Some(dir) = parent.filter(|d| *d != root && d.starts_with(root)) {
        if std::fs::remove_dir(dir).is_err() {
            break;
        }
        parent = dir.parent();
    }
    Ok(())
}

/// `between` runs after the safety snapshot and before the files are touched;
/// tests use it to play an agent writing at the worst moment.
pub fn restore_checkpoint(
    project_root: &str,
    worktree_root: &str,
    session: Option<&str>,
    n: u32,
    between: Option<&dyn Fn()>,
) -> Result<RestoreOutcome, ShipError> {
    let target = resolve_linked(project_root, worktree_root)?;
    let root = target.root.as_path();
    let key = session.map_or_else(|| key_for_branch(&target.branch), str::to_owned);
    if !session_ok(&key) {
        return Err(ShipError::new("That checkpoint session name is not valid."));
    }
    let _busy = claim(root)?;
    let wanted = read(root, &key)?
        .into_iter()
        .find(|c| c.n == n)
        .ok_or_else(|| ShipError::new("That checkpoint no longer exists."))?;
    let before = snapshot_tree(root)?;
    if before == wanted.tree {
        return Ok(RestoreOutcome {
            restored: n,
            safety: None,
            changed: 0,
        });
    }
    let safety = save(root, &key, &format!("Before restoring #{n}"), Some(n))?;
    if let Some(hook) = between {
        hook();
    }
    if snapshot_tree(root)? != before {
        return Err(ShipError::new(
            "Files changed while restoring, so nothing was changed. Wait for the agent to stop and try again.",
        ));
    }
    let changes = differences(root, &before, &wanted.tree)?;
    let saved = format!("Your earlier files are kept as checkpoint #{}.", safety.n);
    let fail = |e: ShipError| ShipError::new(format!("{} {saved}", e.message()));
    for (_, path) in changes.iter().filter(|(s, _)| *s == 'D') {
        remove_file(root, path).map_err(fail)?;
    }
    let write: Vec<&str> = changes
        .iter()
        .filter(|(s, _)| *s != 'D')
        .map(|(_, p)| p.as_str())
        .collect();
    if !write.is_empty() {
        let index = TempIndex::new(root)?;
        let path = index.path();
        let env = [("GIT_INDEX_FILE", path.as_str())];
        git_with(root, &["read-tree", &wanted.tree], &env, None).map_err(fail)?;
        let list = write.join("\0") + "\0";
        git_with(
            root,
            &["checkout-index", "-f", "-z", "--stdin"],
            &env,
            Some(list.as_bytes()),
        )
        .map_err(fail)?;
    }
    Ok(RestoreOutcome {
        restored: n,
        safety: Some(safety),
        changed: changes.len(),
    })
}
