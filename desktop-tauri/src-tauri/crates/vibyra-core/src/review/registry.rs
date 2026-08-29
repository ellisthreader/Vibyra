use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::CoreResult;

use super::{git, git_root};

// The fleet's bookkeeping. Safe mode strands a worktree and a branch every
// time a pane is closed with the X, the app is killed, or a merge dies
// mid-apply, and until now nothing ever swept them up — weeks of daily use
// turns into gigabytes and a `git branch` listing that is mostly ours.
//
// Both functions are hard-guarded to `vibyra/*`. A branch or a folder this
// app did not create is never listed as ours and never deleted, and an
// unmerged branch is somebody's unreviewed work and is never touched at all.

const PREFIX: &str = "vibyra/";

/// A scratch file lives for the milliseconds of a launch, or the length of
/// one apply. Anything still here after this belongs to a process that died,
/// and the wait is what stops the sweep pulling the rug from under a launch
/// happening right now.
const STALE_AFTER: Duration = Duration::from_secs(60 * 60);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeEntry {
    pub path: String,
    pub branch: String,
    pub head: String,
    pub locked: bool,
    /// False when the folder is gone but git still holds the registration —
    /// exactly the state `prune_worktrees` clears.
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PruneOutcome {
    pub pruned_worktrees: usize,
    pub deleted_branches: Vec<String>,
    pub swept_files: usize,
}

/// Every `vibyra/*` worktree registered against the project's repository,
/// whether or not a pane still owns it.
pub fn list_worktrees(project_root: &Path) -> CoreResult<Vec<WorktreeEntry>> {
    let repo = git_root(project_root)?;
    Ok(parse(&git(&repo, &["worktree", "list", "--porcelain"])?))
}

/// `--porcelain` writes one blank-line-separated block per worktree, each
/// line either `key value` or a bare keyword.
fn parse(raw: &str) -> Vec<WorktreeEntry> {
    let mut entries = Vec::new();
    for block in raw.split("\n\n") {
        let (mut path, mut head, mut branch) = (String::new(), String::new(), String::new());
        let mut locked = false;
        for line in block.lines() {
            let (key, value) = line.split_once(' ').unwrap_or((line, ""));
            match key {
                "worktree" => path = value.to_string(),
                "HEAD" => head = value.to_string(),
                "branch" => branch = value.trim_start_matches("refs/heads/").to_string(),
                "locked" => locked = true,
                _ => {}
            }
        }
        if path.is_empty() || !branch.starts_with(PREFIX) {
            continue;
        }
        entries.push(WorktreeEntry {
            exists: Path::new(&path).is_dir(),
            path,
            branch,
            head,
            locked,
        });
    }
    entries
}

/// Clears registrations whose folder is gone, then the `vibyra/*` branches
/// left with no worktree that are already merged into the project's HEAD,
/// then the scratch files a dying launch or merge stranded.
///
/// The branch delete stays `-d` rather than `-D` even though the merged set
/// is already filtered: git's own refusal is a second lock on the same door.
pub fn prune_worktrees(project_root: &Path) -> CoreResult<PruneOutcome> {
    let repo = git_root(project_root)?;
    let before = list_worktrees(&repo)?;
    git(&repo, &["worktree", "prune"])?;
    let after = list_worktrees(&repo)?;

    let mut deleted_branches = Vec::new();
    for branch in merged_branches(&repo)? {
        if after.iter().any(|entry| entry.branch == branch) {
            continue;
        }
        if git(&repo, &["branch", "-d", &branch]).is_ok() {
            deleted_branches.push(branch);
        }
    }
    Ok(PruneOutcome {
        pruned_worktrees: before.len().saturating_sub(after.len()),
        deleted_branches,
        swept_files: sweep(&before),
    })
}

fn merged_branches(repo: &Path) -> CoreResult<Vec<String>> {
    let raw = git(
        repo,
        &[
            "branch",
            "--merged",
            "HEAD",
            "--format=%(refname:short)",
            "--list",
            "vibyra/*",
        ],
    )?;
    Ok(raw
        .lines()
        .map(str::trim)
        .filter(|name| name.starts_with(PREFIX))
        .map(String::from)
        .collect())
}

/// Stray files sit beside the worktrees, so the folders just listed are the
/// only places to look — the sweep never wanders into a directory this app
/// did not create.
fn sweep(entries: &[WorktreeEntry]) -> usize {
    let mut roots: Vec<PathBuf> = entries
        .iter()
        .filter_map(|entry| Path::new(&entry.path).parent().map(Path::to_path_buf))
        .collect();
    roots.sort();
    roots.dedup();
    roots.iter().map(|root| sweep_root(root)).sum()
}

fn sweep_root(root: &Path) -> usize {
    let Ok(listing) = std::fs::read_dir(root) else {
        return 0;
    };
    let mut swept = 0;
    for entry in listing.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let scratch = name.ends_with(".vibyra-merge.patch")
            || (name.starts_with("snapshot-") && name.ends_with(".index"));
        if scratch && stale(&entry.path()) && std::fs::remove_file(entry.path()).is_ok() {
            swept += 1;
        }
    }
    swept
}

fn stale(path: &Path) -> bool {
    std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .map(|modified| modified.elapsed().is_ok_and(|age| age > STALE_AFTER))
        .unwrap_or(false)
}

#[cfg(test)]
#[path = "registry_tests.rs"]
mod tests;
