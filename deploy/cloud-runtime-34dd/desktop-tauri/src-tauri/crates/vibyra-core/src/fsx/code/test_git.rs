//! Git helpers for the code-view tests.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Runs git in `dir` with a throwaway identity; panics with stderr on failure.
pub fn run(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args([
            "-c",
            "user.email=test@vibyra.test",
            "-c",
            "user.name=Vibyra Test",
        ])
        .args([
            "-c",
            "commit.gpgsign=false",
            "-c",
            "init.defaultBranch=main",
        ])
        .args(args)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A canonical temp folder holding a fresh repository.
pub fn repo() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap().join("repo");
    std::fs::create_dir(&root).unwrap();
    run(&root, &["init", "-q"]);
    (temp, root)
}

pub fn commit_all(dir: &Path, message: &str) -> String {
    run(dir, &["add", "-A"]);
    run(dir, &["commit", "-q", "-m", message]);
    run(dir, &["rev-parse", "HEAD"])
}

pub fn write(dir: &Path, rel: &str, text: &str) {
    let path = dir.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

pub fn text(value: &Path) -> &str {
    value.to_str().unwrap()
}
