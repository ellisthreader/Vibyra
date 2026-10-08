//! Clearing a worktree after its pull request is merged.
//!
//! Follows the Agent worktree discard rules: only a registered linked worktree
//! of this project, never forced (a folder with changes stays), and the branch
//! goes only when nothing newer than the merged commit lives on it.
use super::git::{git, text};
use super::guard::resolve;
use super::ShipError;
use crate::fsx::worktree_status::facts;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoveOutcome {
    pub removed: bool,
    pub branch_deleted: bool,
}

/// `merged_sha` is the head commit the merged pull request had; the worktree
/// must still be exactly there, with nothing uncommitted.
pub fn remove_worktree(
    project_root: &str,
    worktree_root: &str,
    merged_sha: &str,
) -> Result<RemoveOutcome, ShipError> {
    let target = resolve(project_root, worktree_root)?;
    let current = facts(&target.root)?;
    if current.dirty > 0 {
        return Err(ShipError::new(
            "This worktree still has uncommitted changes, so it was kept.",
        ));
    }
    if current.head != merged_sha || merged_sha.len() < 40 {
        return Err(ShipError::new(
            "This worktree has commits that were not part of the merge, so it was kept.",
        ));
    }
    git(
        &target.main_root,
        &["worktree", "remove", &target.root.to_string_lossy()],
    )
    .map_err(|_| {
        ShipError::new("The worktree could not be removed. Close anything using it and try again.")
    })?;
    // A squash merge leaves the branch "unmerged" to Git, which is why -D is
    // needed; the head check above is what proves nothing is lost.
    let branch_deleted = git(&target.main_root, &["branch", "-D", &target.branch]).is_ok();
    let _ = text(&target.main_root, &["worktree", "prune"]);
    Ok(RemoveOutcome {
        removed: true,
        branch_deleted,
    })
}
