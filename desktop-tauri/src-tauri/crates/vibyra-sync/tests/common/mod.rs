#![allow(dead_code)]
//! Shared helpers for the integration tests.
use std::path::{Path, PathBuf};
use vibyra_sync::git::Git;
use vibyra_sync::snapshot::{take_snapshot, Snapshot, SnapshotOptions, SnapshotOutcome, SNAP_REF};

pub mod fake;
pub mod login;
pub mod rig;

/// Plain `git` for building fixtures (the library's hardened runner is what is under test).
pub fn git(dir: &Path, args: &[&str]) -> String {
    let out = std::process::Command::new("git")
        .args([
            "-c",
            "user.name=T",
            "-c",
            "user.email=t@example.com",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "init.defaultBranch=main",
        ])
        .args(args)
        .current_dir(dir)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

pub fn write(root: &Path, rel: &str, body: &str) {
    write_bytes(root, rel, body.as_bytes());
}

pub fn write_bytes(root: &Path, rel: &str, body: &[u8]) {
    let p = root.join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, body).unwrap();
}

pub fn repo(root: &Path) {
    git(root, &["init", "-q", "."]);
}

pub fn snap(root: &Path, shadow: &Path, opts: &SnapshotOptions) -> Snapshot {
    match take_snapshot(root, shadow, opts).expect("snapshot") {
        SnapshotOutcome::Taken(s) => s,
        other => panic!("expected a snapshot, got {other:?}"),
    }
}

/// `path` of every file in a commit's tree, sorted.
pub fn files_at(shadow: &Path, rev: &str) -> Vec<String> {
    Git::shadow(shadow)
        .text(&["ls-tree", "-r", "--name-only", rev])
        .unwrap()
        .lines()
        .map(String::from)
        .collect()
}

pub fn tree_of(repo: &Path, rev: &str) -> String {
    Git::shadow(repo)
        .text(&["rev-parse", &format!("{rev}^{{tree}}")])
        .unwrap()
}

pub fn blob_at(shadow: &Path, rev: &str, path: &str) -> String {
    String::from_utf8(
        Git::shadow(shadow)
            .out(&["cat-file", "blob", &format!("{rev}:{path}")])
            .unwrap(),
    )
    .unwrap()
}

pub fn bare(dir: &Path) -> PathBuf {
    let p = dir.join("fresh.git");
    vibyra_sync::git::ensure_shadow(&p).unwrap();
    p
}

/// Builds a "cloud" repo on top of the Mac's last snapshot, applies `edit` to its work tree, commits, and
/// returns an incremental bundle of `refs/vibyra/cloud` (against `mac_head`) plus the cloud head.
pub fn cloud_bundle(
    shadow: &Path,
    scratch: &Path,
    mac_head: &str,
    edit: impl Fn(&Path),
) -> (Vec<u8>, String) {
    let work = scratch.join("cloud-work");
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).unwrap();
    git(&work, &["init", "-q", "."]);
    git(
        &work,
        &[
            "fetch",
            "-q",
            shadow.to_str().unwrap(),
            &format!("{SNAP_REF}:refs/heads/base"),
        ],
    );
    git(&work, &["checkout", "-q", "base"]);
    edit(&work);
    git(&work, &["add", "-A"]);
    git(&work, &["commit", "-qm", "cloud edit"]);
    let head = git(&work, &["rev-parse", "HEAD"]);
    git(&work, &["update-ref", "refs/vibyra/cloud", &head]);
    let out = scratch.join("cloud.bundle");
    git(
        &work,
        &[
            "bundle",
            "create",
            "-q",
            out.to_str().unwrap(),
            "refs/vibyra/cloud",
            &format!("^{mac_head}"),
        ],
    );
    (std::fs::read(&out).unwrap(), head)
}
