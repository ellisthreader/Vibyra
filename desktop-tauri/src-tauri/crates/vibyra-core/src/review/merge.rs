use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use crate::{CoreError, CoreResult};

use super::{conflicts, git, git_bytes, git_root, repo_relative, vibyra_branch, MergeOutcome};

// A review ends one of two ways. **Merge back** lands the worktree's changes
// in the user's checkout as ordinary working-tree edits — Vibyra never commits
// to the user's branch, the same contract `prepare_safe_workspace` keeps on
// the way in. **Discard** removes the worktree and its branch; the snapshot
// commit stays reachable through git's reflog grace period.

/// Applies what the worktree changed since `base` onto the project's checkout.
/// `paths` narrows that to a selection, repo-root-relative; an empty slice
/// means everything. All-or-nothing over whatever was selected: the patch is
/// checked first, and a conflict reports the files in the way while changing
/// nothing at all.
pub fn merge_back(
    project_root: &Path,
    worktree: &Path,
    base: &str,
    paths: &[String],
) -> CoreResult<MergeOutcome> {
    vibyra_branch(worktree)?;
    for path in paths {
        repo_relative(path)?;
    }
    let repo = git_root(project_root)?;
    let source = git_root(worktree)?;
    let specs: Vec<&str> = paths.iter().map(String::as_str).collect();

    // Files the agent created but never added have to enter the diff; staging
    // them touches only Vibyra's worktree, never the user's index.
    git(&source, &scoped(&["add", "-A"], &specs))?;
    let patch = git_bytes(&source, &scoped(&["diff", "--binary", base], &specs))?;
    if patch.is_empty() {
        return Ok(MergeOutcome {
            applied: false,
            conflicts: Vec::new(),
        });
    }

    let patch_file = patch_path(worktree);
    std::fs::write(&patch_file, &patch)?;
    let outcome = apply(&repo, &patch_file, worktree);
    let _ = std::fs::remove_file(&patch_file);
    outcome
}

/// The selection scopes both halves, so what is staged and what is diffed
/// are the same set and the all-or-nothing property holds over exactly the
/// files the user ticked.
fn scoped<'a>(args: &[&'a str], specs: &[&'a str]) -> Vec<&'a str> {
    let mut all = args.to_vec();
    if !specs.is_empty() {
        all.push("--");
        all.extend(specs);
    }
    all
}

/// Three-way, through a throwaway index.
///
/// `--3way` is what lets a merge survive the project moving on in a
/// *different* hunk of the same file; plain `apply` fails on that context
/// drift alone. Git implies `--index` with it, though, which on a dirty
/// checkout refuses outright ("does not match index") and otherwise stages
/// what it landed — and the user's index is theirs. An index built from the
/// current working tree and thrown away afterwards gives git what it needs
/// while leaving the real one alone.
fn apply(repo: &Path, patch_file: &Path, worktree: &Path) -> CoreResult<MergeOutcome> {
    let index = scratch_index(worktree);
    let outcome = checked_apply(repo, &index, patch_file);
    let _ = std::fs::remove_file(&index);
    outcome
}

fn checked_apply(repo: &Path, index: &Path, patch_file: &Path) -> CoreResult<MergeOutcome> {
    mirror_working_tree(repo, index)?;
    let patch = patch_file.to_string_lossy();

    // `--check` is not the whole gate under `--3way`: git exits 0 having
    // resolved *with markers*, so what it wrote to stderr is read too and a
    // patch that would land markers lands nothing instead.
    let check = three_way(repo, index, &["--check", patch.as_ref()])?;
    let noise = String::from_utf8_lossy(&check.stderr).to_string();
    let blocked = if check.status.success() {
        conflicts::unresolved(&noise)
    } else {
        conflicts::blocked(&noise)
    };
    if !blocked.is_empty() {
        return Ok(MergeOutcome {
            applied: false,
            conflicts: blocked,
        });
    }

    let landed = three_way(repo, index, &[patch.as_ref()])?;
    if !landed.status.success() {
        return Ok(MergeOutcome {
            applied: false,
            conflicts: conflicts::blocked(&String::from_utf8_lossy(&landed.stderr)),
        });
    }
    Ok(MergeOutcome {
        applied: true,
        conflicts: Vec::new(),
    })
}

fn three_way(repo: &Path, index: &Path, args: &[&str]) -> CoreResult<Output> {
    Ok(Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["apply", "--3way"])
        .args(args)
        .env("GIT_INDEX_FILE", index)
        .output()?)
}

/// The scratch index has to agree with the working tree, or three-way refuses
/// before it starts.
fn mirror_working_tree(repo: &Path, index: &Path) -> CoreResult<()> {
    for args in [["read-tree", "HEAD"], ["add", "-A"]] {
        let output = Command::new("git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .env("GIT_INDEX_FILE", index)
            .output()?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(CoreError::Settings(format!(
                "Review could not prepare the merge: {detail}"
            )));
        }
    }
    Ok(())
}

/// Removes the worktree and deletes its `vibyra/*` branch. Refuses any other
/// branch — the guard that keeps a stray path from deleting real work.
pub fn discard_worktree(project_root: &Path, worktree: &Path) -> CoreResult<()> {
    let branch = vibyra_branch(worktree)?;
    let repo = git_root(project_root)?;
    git(
        &repo,
        &["worktree", "remove", "--force", &worktree.to_string_lossy()],
    )?;
    git(&repo, &["branch", "-D", &branch])?;
    Ok(())
}

/// The patch sits beside the worktree, not in a shared temp dir: unique per
/// worktree, cleaned with it, and never racing another merge.
fn patch_path(worktree: &Path) -> PathBuf {
    worktree.with_extension("vibyra-merge.patch")
}

/// The scratch index keeps the same company, and wears the `snapshot-*.index`
/// name the housekeeping sweep already knows to reap if a merge dies.
fn scratch_index(worktree: &Path) -> PathBuf {
    let name = worktree
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("merge");
    worktree.with_file_name(format!("snapshot-merge-{name}.index"))
}
