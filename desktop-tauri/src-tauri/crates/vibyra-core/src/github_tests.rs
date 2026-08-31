use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::*;

fn run_git(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["-c", "user.name=Test", "-c", "user.email=test@example.com"])
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "git {args:?} failed");
}

fn show(dir: &Path, spec: &str) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["show", spec])
        .output()
        .unwrap();
    String::from_utf8_lossy(&output.stdout).to_string()
}

/// A committed repo, a bare `origin`, and a `vibyra/test-1` worktree holding
/// an **uncommitted** agent edit — the state a real review pushes from.
fn repo_origin_worktree(temp: &Path) -> (PathBuf, PathBuf, PathBuf) {
    let repo = temp.join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    run_git(&repo, &["init"]);
    std::fs::write(repo.join("a.txt"), "before\n").unwrap();
    run_git(&repo, &["add", "."]);
    run_git(&repo, &["commit", "-m", "initial"]);
    let origin = temp.join("origin.git");
    let output = Command::new("git")
        .args(["init", "--bare"])
        .arg(&origin)
        .output()
        .unwrap();
    assert!(output.status.success());
    run_git(
        &repo,
        &["remote", "add", "origin", &origin.to_string_lossy()],
    );
    let worktree = temp.join("wt");
    run_git(
        &repo,
        &[
            "worktree",
            "add",
            "-b",
            "vibyra/test-1",
            &worktree.to_string_lossy(),
        ],
    );
    std::fs::write(worktree.join("a.txt"), "after\n").unwrap();
    (repo, origin, worktree)
}

/// A fake `gh` on an isolated PATH — the provider-auth harness pattern — so
/// the push is exercised for real while the PR call is scripted.
fn fake_gh(dir: &Path) -> std::ffi::OsString {
    let bin = dir.join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    let gh = bin.join("gh");
    std::fs::write(
        &gh,
        "#!/bin/sh\nif [ \"$1\" = \"pr\" ]; then echo 'https://github.com/ellis/vibyra/pull/7'; fi\nexit 0\n",
    )
    .unwrap();
    std::fs::set_permissions(&gh, std::fs::Permissions::from_mode(0o755)).unwrap();
    let mut path = bin.into_os_string();
    path.push(":/usr/bin:/bin");
    path
}

#[test]
fn status_reports_a_missing_origin_without_erroring() {
    let temp = tempfile::tempdir().unwrap();
    let status = github_status(temp.path());
    assert!(status.origin.is_none());
}

#[test]
fn every_pull_request_gh_command_ignores_ambient_tokens() {
    let command = gh(None);
    let removed: Vec<_> = command
        .get_envs()
        .filter(|(_, value)| value.is_none())
        .map(|(name, _)| name.to_string_lossy().into_owned())
        .collect();
    for name in [
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "GH_ENTERPRISE_TOKEN",
        "GITHUB_ENTERPRISE_TOKEN",
    ] {
        assert!(removed.iter().any(|removed| removed == name));
    }
}

#[test]
fn create_pr_ships_the_uncommitted_work_not_just_the_snapshot() {
    let temp = tempfile::tempdir().unwrap();
    let (repo, origin, worktree) = repo_origin_worktree(temp.path());
    let path = fake_gh(temp.path());

    let url = create_pr_with_path(&worktree, "Title", "Body", None, Some(&path)).unwrap();
    assert_eq!(url, "https://github.com/ellis/vibyra/pull/7");
    // The agent never committed; the PR is worthless unless the push carried
    // the edit anyway.
    assert_eq!(show(&origin, "vibyra/test-1:a.txt"), "after\n");
    // The user's own checkout and branch stay untouched.
    assert_eq!(
        std::fs::read_to_string(repo.join("a.txt")).unwrap(),
        "before\n"
    );
}

#[test]
fn a_fully_committed_worktree_pushes_without_an_extra_commit() {
    let temp = tempfile::tempdir().unwrap();
    let (_repo, origin, worktree) = repo_origin_worktree(temp.path());
    run_git(&worktree, &["add", "."]);
    run_git(&worktree, &["commit", "-m", "agent work"]);
    let path = fake_gh(temp.path());

    create_pr_with_path(&worktree, "Title", "Body", None, Some(&path)).unwrap();
    let log = show(&origin, "vibyra/test-1");
    assert!(log.contains("agent work"));
    assert!(
        !log.contains("Title"),
        "no empty commit should be added on top"
    );
}

#[test]
fn only_vibyra_branches_may_become_pull_requests() {
    let temp = tempfile::tempdir().unwrap();
    let (repo, _origin, _worktree) = repo_origin_worktree(temp.path());
    // The repo itself sits on the user's branch, not a vibyra/* one.
    assert!(create_pr(&repo, "t", "b", None).is_err());
}

#[test]
fn only_a_github_origin_arms_the_share_flow() {
    // Exact host or nothing: a lookalike domain, a GitLab remote, or the
    // local file path the other fixtures use must all read as "not GitHub".
    assert!(is_github_remote("https://github.com/ellis/vibyra.git"));
    assert!(is_github_remote("git@github.com:ellis/vibyra.git"));
    assert!(is_github_remote("ssh://git@github.com/ellis/vibyra.git"));
    assert!(!is_github_remote("https://gitlab.com/ellis/vibyra.git"));
    assert!(!is_github_remote("https://github.com.evil.example/x.git"));
    assert!(!is_github_remote("git@github.com.evil.example:x.git"));

    // The status probe keeps the raw origin for display but only flags
    // GitHub-capable ones — the fixture's origin is a local bare repo.
    let temp = tempfile::tempdir().unwrap();
    let (repo, _origin, _worktree) = repo_origin_worktree(temp.path());
    let status = github_status(&repo);
    assert!(status.origin.is_some());
    assert!(!status.origin_github);
}
