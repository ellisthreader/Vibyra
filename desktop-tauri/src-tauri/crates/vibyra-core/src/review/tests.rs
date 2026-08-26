use std::path::{Path, PathBuf};
use std::process::Command;

use crate::workspace::{prepare_safe_workspace, SafeWorkspace};

use super::status::worktree_status;
use super::{discard_worktree, file_diff, merge_back, ChangeKind};

fn run(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["-c", "user.name=Test", "-c", "user.email=test@example.com"])
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "git {args:?} failed");
}

/// A committed repo plus a safe-mode worktree launched from a clean tree,
/// exactly as `prepare_safe_workspace` builds one in production.
fn repo_and_worktree(temp: &Path) -> (PathBuf, SafeWorkspace) {
    let repo = temp.join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    run(&repo, &["init"]);
    std::fs::write(repo.join("tracked.txt"), "one\ntwo\n").unwrap();
    std::fs::write(repo.join("doomed.txt"), "bye\n").unwrap();
    run(&repo, &["add", "."]);
    run(&repo, &["commit", "-m", "initial"]);
    let safe = prepare_safe_workspace(&repo, &temp.join("worktrees"), None).unwrap();
    (repo, safe)
}

fn read_lf(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap().replace("\r\n", "\n")
}

fn agent_edits(safe: &SafeWorkspace) {
    std::fs::write(safe.cwd.join("tracked.txt"), "one\nchanged\n").unwrap();
    std::fs::write(safe.cwd.join("fresh.txt"), "a\nb\nc\n").unwrap();
    std::fs::remove_file(safe.cwd.join("doomed.txt")).unwrap();
}

#[test]
fn status_reports_every_kind_with_counts() {
    let temp = tempfile::tempdir().unwrap();
    let (_repo, safe) = repo_and_worktree(temp.path());
    agent_edits(&safe);

    let status = worktree_status(&safe.cwd, &safe.base_commit).unwrap();
    assert!(!status.truncated);
    let kinds: Vec<(&str, ChangeKind)> = status
        .changed
        .iter()
        .map(|file| (file.path.as_str(), file.kind))
        .collect();
    assert_eq!(
        kinds,
        vec![
            ("doomed.txt", ChangeKind::Deleted),
            ("fresh.txt", ChangeKind::Added),
            ("tracked.txt", ChangeKind::Modified),
        ]
    );
    let fresh = &status.changed[1];
    assert_eq!((fresh.additions, fresh.deletions), (3, 0));
    let tracked = &status.changed[2];
    assert_eq!((tracked.additions, tracked.deletions), (1, 1));
}

#[test]
fn diffs_cover_tracked_and_untracked_and_refuse_escapes() {
    let temp = tempfile::tempdir().unwrap();
    let (_repo, safe) = repo_and_worktree(temp.path());
    agent_edits(&safe);

    let tracked = file_diff(&safe.cwd, &safe.base_commit, "tracked.txt").unwrap();
    assert!(tracked.contains("-two"));
    assert!(tracked.contains("+changed"));

    let fresh = file_diff(&safe.cwd, &safe.base_commit, "fresh.txt").unwrap();
    assert!(fresh.contains("+a"));

    assert!(file_diff(&safe.cwd, &safe.base_commit, "../outside.txt").is_err());
    assert!(file_diff(&safe.cwd, &safe.base_commit, "/etc/hostname").is_err());
}

#[test]
fn merge_back_lands_changes_without_touching_head_or_index() {
    let temp = tempfile::tempdir().unwrap();
    let (repo, safe) = repo_and_worktree(temp.path());
    let head = crate::workspace_preflight::git(&repo, &["rev-parse", "HEAD"]).unwrap();
    agent_edits(&safe);

    let outcome = merge_back(&repo, &safe.cwd, &safe.base_commit).unwrap();
    assert!(outcome.applied);
    assert!(outcome.conflicts.is_empty());
    // Normalized: Windows checkouts read back CRLF under git's autocrlf.
    assert_eq!(read_lf(&repo.join("tracked.txt")), "one\nchanged\n");
    assert_eq!(read_lf(&repo.join("fresh.txt")), "a\nb\nc\n");
    assert!(!repo.join("doomed.txt").exists());
    // The user's branch and index stay theirs: same HEAD, nothing staged.
    assert_eq!(
        crate::workspace_preflight::git(&repo, &["rev-parse", "HEAD"]).unwrap(),
        head
    );
    assert!(
        crate::workspace_preflight::git(&repo, &["diff", "--cached", "--name-only"])
            .unwrap()
            .is_empty()
    );
}

#[test]
fn merge_back_conflicts_report_and_change_nothing() {
    let temp = tempfile::tempdir().unwrap();
    let (repo, safe) = repo_and_worktree(temp.path());
    agent_edits(&safe);
    // The user rewrote the same file while the agent worked.
    std::fs::write(repo.join("tracked.txt"), "mine\n").unwrap();

    let outcome = merge_back(&repo, &safe.cwd, &safe.base_commit).unwrap();
    assert!(!outcome.applied);
    assert_eq!(outcome.conflicts, vec!["tracked.txt".to_string()]);
    // All-or-nothing: the clean parts of the patch must not half-land either.
    assert_eq!(
        std::fs::read_to_string(repo.join("tracked.txt")).unwrap(),
        "mine\n"
    );
    assert!(!repo.join("fresh.txt").exists());
    assert!(repo.join("doomed.txt").exists());
}

#[test]
fn untouched_worktree_merges_as_a_no_op() {
    let temp = tempfile::tempdir().unwrap();
    let (repo, safe) = repo_and_worktree(temp.path());
    let outcome = merge_back(&repo, &safe.cwd, &safe.base_commit).unwrap();
    assert!(!outcome.applied);
    assert!(outcome.conflicts.is_empty());
}

#[test]
fn discard_removes_the_worktree_and_its_branch() {
    let temp = tempfile::tempdir().unwrap();
    let (repo, safe) = repo_and_worktree(temp.path());
    agent_edits(&safe);

    discard_worktree(&repo, &safe.cwd).unwrap();
    assert!(!safe.cwd.exists());
    assert!(
        crate::workspace_preflight::git(&repo, &["branch", "--list", "vibyra/*"])
            .unwrap()
            .is_empty()
    );
}

#[test]
fn review_refuses_paths_that_are_not_vibyra_worktrees() {
    let temp = tempfile::tempdir().unwrap();
    let (repo, _safe) = repo_and_worktree(temp.path());
    // The repo itself sits on the user's branch, not a vibyra/* one.
    assert!(merge_back(&repo, &repo, "HEAD").is_err());
    assert!(discard_worktree(&repo, &repo).is_err());
}
