//! The check every ship step makes before it touches a worktree.
use super::git::text;
use super::ShipError;
use crate::fsx::worktrees::{read_inventory, Worktree};
use std::path::{Path, PathBuf};

/// A worktree Vibyra created for an agent, confirmed against Git just now.
#[derive(Debug, Clone)]
pub(crate) struct Target {
    /// Worktree top level: where Git commands run.
    pub root: PathBuf,
    pub branch: String,
    /// The main worktree, for commands that must run outside the linked one.
    pub main_root: PathBuf,
    pub default_branch: Option<String>,
}

const ALWAYS_PROTECTED: [&str; 3] = ["main", "master", "HEAD"];

/// The repository's default branch as this clone knows it (`origin/HEAD`,
/// else `origin/main|master`, else a local `main|master`).
pub(crate) fn default_branch(repo: &Path) -> Option<String> {
    if let Ok(head) = text(
        repo,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    ) {
        return head.strip_prefix("origin/").map(str::to_owned);
    }
    ["main", "master"].iter().find_map(|name| {
        [
            format!("refs/remotes/origin/{name}"),
            format!("refs/heads/{name}"),
        ]
        .iter()
        .any(|r| text(repo, &["rev-parse", "--verify", "--quiet", r]).is_ok())
        .then(|| name.to_string())
    })
}

fn is_protected(branch: &str, default: Option<&str>) -> bool {
    ALWAYS_PROTECTED.contains(&branch) || default == Some(branch)
}

/// A linked worktree of this project that exists on disk: enough for the
/// private checkpoints, which never leave the repository's own refs.
pub(crate) fn resolve_linked(project_root: &str, worktree_root: &str) -> Result<Target, ShipError> {
    let inventory = read_inventory(project_root)
        .map_err(|_| ShipError::new("This project is not a Git repository."))?;
    let main = inventory
        .worktrees
        .iter()
        .find(|t| t.is_main)
        .ok_or_else(|| ShipError::new("The main working folder could not be found."))?;
    let tree: &Worktree = inventory
        .worktrees
        .iter()
        .find(|t| t.root == worktree_root)
        .ok_or_else(|| ShipError::new("That is not one of this project's worktrees."))?;
    if tree.is_main {
        return Err(ShipError::new(
            "The main working folder is never committed or pushed from here.",
        ));
    }
    if !tree.available {
        return Err(ShipError::new(
            "This working folder is unavailable. Restore it first.",
        ));
    }
    Ok(Target {
        root: Path::new(&tree.root).to_path_buf(),
        branch: tree.branch.clone(),
        main_root: Path::new(&main.root).to_path_buf(),
        default_branch: None,
    })
}

/// A worktree that may be committed to and pushed: on a real branch (asked of
/// Git again, so a checkout made since the inventory cannot redirect the step)
/// that is not the default branch.
pub(crate) fn resolve(project_root: &str, worktree_root: &str) -> Result<Target, ShipError> {
    let mut target = resolve_linked(project_root, worktree_root)?;
    let live = text(&target.root, &["symbolic-ref", "--short", "-q", "HEAD"]).map_err(|_| {
        ShipError::new("This worktree is on a detached HEAD. Switch to a branch first.")
    })?;
    if live != target.branch || target.branch == "Detached HEAD" {
        return Err(ShipError::new(
            "This worktree's branch changed. Refresh and try again.",
        ));
    }
    let default = default_branch(&target.main_root);
    if is_protected(&live, default.as_deref()) {
        return Err(ShipError::new(format!(
            "{live} is the default branch. Vibyra only ships agent branches."
        )));
    }
    target.default_branch = default;
    Ok(target)
}
