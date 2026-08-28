use std::path::Path;
use std::process::Command;

use tempfile::tempdir;

use super::project_activity;

fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "git {args:?} failed");
}

fn repository(root: &Path) {
    git(root, &["init"]);
    git(root, &["config", "user.email", "test@vibyra.local"]);
    git(root, &["config", "user.name", "Vibyra Test"]);
}

#[test]
fn non_git_folders_return_a_useful_empty_state() {
    let root = tempdir().unwrap();
    let activity = project_activity(root.path()).unwrap();
    assert!(!activity.is_git);
    assert!(activity.days.is_empty());
}

#[test]
fn committed_and_working_tree_counts_stay_separate() {
    let root = tempdir().unwrap();
    repository(root.path());
    std::fs::write(root.path().join("tracked.txt"), "one\ntwo\n").unwrap();
    git(root.path(), &["add", "."]);
    git(root.path(), &["commit", "-m", "initial"]);

    std::fs::write(root.path().join("tracked.txt"), "one\nthree\n").unwrap();
    std::fs::write(root.path().join("fresh.txt"), "alpha\nbeta\n").unwrap();
    std::fs::write(root.path().join("image.bin"), [0_u8, 1, 2, 3]).unwrap();

    let activity = project_activity(root.path()).unwrap();
    assert!(activity.is_git);
    assert_eq!(activity.days.len(), 1);
    assert_eq!(activity.days[0].counts.additions, 2);
    assert_eq!(activity.days[0].counts.commits, 1);
    assert_eq!(activity.working_tree.additions, 3);
    assert_eq!(activity.working_tree.deletions, 1);
    assert_eq!(activity.working_tree.changed_files, 3);
    assert_eq!(activity.working_tree.binary_files, 1);
}
