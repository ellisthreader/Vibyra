use std::path::Path;
use std::process::Command;

use serde::Serialize;

use crate::{CoreError, CoreResult};

mod diff;
mod merge;
#[cfg(test)]
mod reject_tests;
mod status;
#[cfg(test)]
mod tests;

pub use diff::file_diff;
pub use merge::{discard_worktree, merge_back, reject_file};
pub use status::worktree_status;

// Reviewing a safe-mode worktree: what changed, one file's diff, and the two
// ways a review ends — the changes come home, or the worktree is discarded.
// Everything here reads or writes through `git` subprocesses, never through
// the user's index or branch.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub previous_path: Option<String>,
    pub kind: ChangeKind,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeStatus {
    pub changed: Vec<ChangedFile>,
    /// True when the list was cut at the ceiling — said, never silent.
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeOutcome {
    pub applied: bool,
    /// Files that stopped a merge. Non-empty means nothing was changed.
    pub conflicts: Vec<String>,
}

pub(crate) fn git(dir: &Path, args: &[&str]) -> CoreResult<String> {
    String::from_utf8(git_bytes(dir, args)?)
        .map(|text| text.trim().to_string())
        .map_err(|_| CoreError::Settings("git returned invalid UTF-8".to_string()))
}

pub(crate) fn git_bytes(dir: &Path, args: &[&str]) -> CoreResult<Vec<u8>> {
    let output = Command::new("git").arg("-C").arg(dir).args(args).output()?;
    if output.status.success() {
        return Ok(output.stdout);
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(CoreError::Settings(format!(
        "Review could not {}: {detail}",
        args.join(" ")
    )))
}

/// Only Vibyra's own branches may be merged or deleted through this module.
/// The worktree path arrives from the renderer, so the branch it is on is the
/// proof it is ours — a review command pointed anywhere else must refuse.
pub(crate) fn vibyra_branch(worktree: &Path) -> CoreResult<String> {
    let branch = git(worktree, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    if !branch.starts_with("vibyra/") {
        return Err(CoreError::InvalidPath(format!(
            "{branch} is not a Vibyra safe-mode branch"
        )));
    }
    Ok(branch)
}
