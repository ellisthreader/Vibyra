//! The Git panel beyond Safe Mode (Part 18): history, branches, stash, blame
//! and a minimal merge-conflict resolver for a saved project's own checkout.
//!
//! Every entry point takes a root the command layer already admitted (a saved
//! project or its worktree) and runs Git through `ship::git`: argv only, no
//! shell, hooks and fsmonitor off, filters overridden, prompts refused, output
//! and time bounded. Nothing here forces, resets, discards or pushes. Names
//! that reach Git as arguments are validated first and never start with `-`.
mod blame;
mod branches;
mod conflict_parse;
mod conflicts;
mod history;
mod refs;
mod stash;
#[cfg(test)]
mod tests_branches;
#[cfg(test)]
mod tests_conflicts;
#[cfg(test)]
mod tests_history;
#[cfg(test)]
mod tests_support;

pub use blame::{blame, Blame, BlameCommit};
pub use branches::{
    branches, create_branch, switch_branch, Branch, Branches, SwitchMode, SwitchOutcome,
};
pub use conflict_parse::Segment;
pub use conflicts::{
    list_conflicts, read_conflict, resolve_conflict, Choice, ConflictDoc, Resolved,
};
pub use history::{history, Commit, History};
pub use stash::{stash_list, stash_pop, stash_save, PopOutcome, StashEntry};

use crate::fsx::ship::git::text;
use crate::fsx::ship::ShipError;
use std::path::Path;

pub type GitResult<T> = Result<T, ShipError>;

/// Prefix of the refusal a branch switch makes over uncommitted changes, so
/// the renderer can offer "stash and switch" instead of just printing it.
pub const DIRTY_PREFIX: &str = "dirty-tree:";

/// Tracked files with staged or unstaged changes. Untracked files do not
/// block a switch and are never stashed.
pub(crate) fn changed_files(root: &Path) -> GitResult<Vec<String>> {
    let out = text(root, &["status", "--porcelain=v1", "--untracked-files=no"])?;
    Ok(out
        .lines()
        .filter(|line| line.len() > 3)
        .map(|line| line[3..].to_string())
        .collect())
}

/// Unmerged files under `root`, relative to it, in Git's order.
pub(crate) fn unmerged(root: &Path) -> GitResult<Vec<String>> {
    let out = text(
        root,
        &["diff", "--name-only", "--diff-filter=U", "--relative"],
    )?;
    Ok(out
        .lines()
        .map(str::to_string)
        .filter(|l| !l.is_empty())
        .collect())
}
