use super::*;
use std::process::Command;

fn run(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn inventories_exact_nested_paths_and_preserves_dirty_files() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repo with spaces");
    std::fs::create_dir_all(repo.join("app")).unwrap();
    run(&repo, &["init"]);
    std::fs::write(repo.join("app/index.html"), "original").unwrap();
    run(&repo, &["add", "."]);
    run(
        &repo,
        &[
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.test",
            "commit",
            "-m",
            "initial",
        ],
    );
    run(
        &repo,
        &["remote", "add", "origin", "git@github.com:owner/repo.git"],
    );
    let tree = temp.path().join("safe space");
    run(
        &repo,
        &[
            "worktree",
            "add",
            "-b",
            "vibyra/task",
            tree.to_str().unwrap(),
        ],
    );
    std::fs::write(repo.join("app/index.html"), "dirty").unwrap();
    let before = git(&repo, &["status", "--porcelain=v1"], 1024).unwrap();
    let result = inventory(repo.join("app").to_str().unwrap()).unwrap();
    assert_eq!(result.repository.as_deref(), Some("owner/repo"));
    assert_eq!(result.worktrees.len(), 2);
    assert!(result.worktrees[0].is_main);
    let safe = &result.worktrees[1];
    assert_eq!(safe.branch, "vibyra/task");
    assert_eq!(
        safe.directory,
        tree.canonicalize().unwrap().join("app").to_string_lossy()
    );
    assert!(safe.available);
    assert_eq!(
        before,
        git(&repo, &["status", "--porcelain=v1"], 1024).unwrap()
    );
    std::fs::remove_dir_all(tree.join("app")).unwrap();
    assert!(
        !inventory(repo.join("app").to_str().unwrap())
            .unwrap()
            .worktrees[1]
            .available
    );
}

#[test]
fn repository_links_never_echo_credentials_or_foreign_hosts() {
    assert_eq!(
        github_repository("https://github.com/a/b.git"),
        Some("a/b".into())
    );
    assert_eq!(
        github_repository("ssh://git@github.com/a/b.git"),
        Some("a/b".into())
    );
    for remote in [
        "https://token@github.com/a/b",
        "https://github.com.evil/a/b",
        "git@evil:a/b",
        "https://github.com/a/../b",
        "https://github.com/a/b?token=x",
    ] {
        assert!(github_repository(remote).is_none());
    }
}

#[test]
fn porcelain_paths_with_newlines_are_not_split() {
    let parsed = parse(
        "worktree /tmp/a\nb\0HEAD abc\0branch refs/heads/vibyra/test\0\0",
        Path::new(""),
    );
    assert_eq!(parsed[0].root, "/tmp/a\nb");
}
