use std::path::{Path, PathBuf};

use crate::{CoreError, CoreResult};

use super::{git, git_bytes, vibyra_branch, MergeOutcome};

// A review ends one of two ways. **Merge back** lands the worktree's changes
// in the user's checkout as ordinary working-tree edits — Vibyra never commits
// to the user's branch, the same contract `prepare_safe_workspace` keeps on
// the way in. **Discard** removes the worktree and its branch; the snapshot
// commit stays reachable through git's reflog grace period.

/// Applies everything the worktree changed since `base` onto the project's
/// checkout. All-or-nothing: the patch is checked first, and a conflict
/// reports the files in the way while changing nothing at all.
pub fn merge_back(project_root: &Path, worktree: &Path, base: &str) -> CoreResult<MergeOutcome> {
    vibyra_branch(worktree)?;
    let repo = repo_root(project_root)?;

    // Files the agent created but never added have to enter the diff; staging
    // them touches only Vibyra's worktree, never the user's index.
    git(worktree, &["add", "-A", "--", "."])?;
    let patch = git_bytes(worktree, &["diff", "--binary", base, "--", "."])?;
    if patch.is_empty() {
        return Ok(MergeOutcome {
            applied: false,
            conflicts: Vec::new(),
        });
    }

    let patch_file = patch_path(worktree);
    std::fs::write(&patch_file, &patch)?;
    let outcome = apply(&repo, &patch_file);
    let _ = std::fs::remove_file(&patch_file);
    outcome
}

fn apply(repo: &Path, patch_file: &Path) -> CoreResult<MergeOutcome> {
    let patch = patch_file.to_string_lossy();
    let check = std::process::Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["apply", "--check", patch.as_ref()])
        .output()?;
    if !check.status.success() {
        return Ok(MergeOutcome {
            applied: false,
            conflicts: conflict_paths(&String::from_utf8_lossy(&check.stderr)),
        });
    }
    git(repo, &["apply", patch.as_ref()])?;
    Ok(MergeOutcome {
        applied: true,
        conflicts: Vec::new(),
    })
}

/// `git apply --check` names each blocked file on stderr, one of
/// `error: patch failed: <path>:<line>` or `error: <path>: <reason>`.
fn conflict_paths(stderr: &str) -> Vec<String> {
    let mut paths: Vec<String> = stderr
        .lines()
        .filter_map(|line| line.strip_prefix("error: "))
        .map(|line| line.strip_prefix("patch failed: ").unwrap_or(line))
        .filter_map(|line| line.split(':').next())
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .collect();
    paths.sort();
    paths.dedup();
    if paths.is_empty() {
        paths.push("the patch could not be applied".to_string());
    }
    paths
}

/// Removes the worktree and deletes its `vibyra/*` branch. Refuses any other
/// branch — the guard that keeps a stray path from deleting real work.
pub fn discard_worktree(project_root: &Path, worktree: &Path) -> CoreResult<()> {
    let branch = vibyra_branch(worktree)?;
    let repo = repo_root(project_root)?;
    git(
        &repo,
        &["worktree", "remove", "--force", &worktree.to_string_lossy()],
    )?;
    git(&repo, &["branch", "-D", &branch])?;
    Ok(())
}

fn repo_root(project_root: &Path) -> CoreResult<PathBuf> {
    if !project_root.is_dir() {
        return Err(CoreError::InvalidPath(
            "project folder is not available".to_string(),
        ));
    }
    Ok(PathBuf::from(git(
        project_root,
        &["rev-parse", "--show-toplevel"],
    )?))
}

/// The patch sits beside the worktree, not in a shared temp dir: unique per
/// worktree, cleaned with it, and never racing another merge.
fn patch_path(worktree: &Path) -> PathBuf {
    worktree.with_extension("vibyra-merge.patch")
}
