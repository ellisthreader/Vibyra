use std::path::{Path, PathBuf};
use std::process::Command;

use crate::workspace::{prepare_safe_workspace, SafeWorkspace};

use super::{reject_file, worktree_status};

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

fn setup(temp: &Path) -> (PathBuf, SafeWorkspace) {
    let repo = temp.join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    run(&repo, &["init"]);
    std::fs::write(repo.join("tracked.txt"), "before\n").unwrap();
    run(&repo, &["add", "."]);
    run(&repo, &["commit", "-m", "initial"]);
    let safe = prepare_safe_workspace(&repo, &temp.join("worktrees"), None).unwrap();
    (repo, safe)
}

#[test]
fn rejecting_one_file_keeps_every_other_safe_change() {
    let temp = tempfile::tempdir().unwrap();
    let (_repo, safe) = setup(temp.path());
    std::fs::write(safe.cwd.join("tracked.txt"), "after\n").unwrap();
    std::fs::write(safe.cwd.join("fresh.txt"), "new\n").unwrap();

    reject_file(&safe.cwd, &safe.base_commit, "fresh.txt").unwrap();

    assert!(!safe.cwd.join("fresh.txt").exists());
    assert_eq!(
        std::fs::read_to_string(safe.cwd.join("tracked.txt")).unwrap(),
        "after\n"
    );
    let status = worktree_status(&safe.cwd, &safe.base_commit).unwrap();
    assert_eq!(status.changed.len(), 1);
    assert_eq!(status.changed[0].path, "tracked.txt");
}

#[test]
fn rejecting_a_rename_restores_the_original_path() {
    let temp = tempfile::tempdir().unwrap();
    let (repo, safe) = setup(temp.path());
    run(&safe.cwd, &["mv", "tracked.txt", "renamed.txt"]);

    reject_file(&safe.cwd, &safe.base_commit, "renamed.txt").unwrap();

    assert!(safe.cwd.join("tracked.txt").exists());
    assert!(!safe.cwd.join("renamed.txt").exists());
    assert!(worktree_status(&safe.cwd, &safe.base_commit)
        .unwrap()
        .changed
        .is_empty());
    assert!(reject_file(&repo, &safe.base_commit, "tracked.txt").is_err());
}
