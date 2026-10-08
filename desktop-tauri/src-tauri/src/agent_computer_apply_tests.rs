use crate::agent_computer_access::discard::discard;
use crate::agent_computer_store::Grant;
use crate::agent_computer_tools::{apply_reviewed, snapshot_for_publish};
use std::path::{Path, PathBuf};
use std::process::Command;

const ID: &str = "123e4567-e89b-12d3-a456-426614174000";

struct Fixture {
    _temp: tempfile::TempDir,
    source: PathBuf,
    storage: PathBuf,
    grant: Grant,
}

fn git(root: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "git {args:?}");
    String::from_utf8(output.stdout).unwrap()
}

fn fixture() -> Fixture {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    std::fs::create_dir(&source).unwrap();
    let source = source.canonicalize().unwrap();
    git(&source, &["init", "-q"]);
    git(&source, &["config", "core.autocrlf", "false"]);
    std::fs::write(source.join("notes.txt"), "Original note\n").unwrap();
    std::fs::write(source.join("gone.txt"), "Delete me\n").unwrap();
    std::fs::write(source.join("other.txt"), "Other\n").unwrap();
    git(&source, &["add", "."]);
    git(
        &source,
        &[
            "-c",
            "user.name=F",
            "-c",
            "user.email=f@example.test",
            "commit",
            "-qm",
            "start",
        ],
    );
    let storage = temp.path().join("private");
    let worktree = vibyra_core::workspace_agent::prepare(&source, &storage, ID).unwrap();
    let grant = Grant {
        id: ID.into(),
        agent_id: "123e4567-e89b-12d3-a456-426614174001".into(),
        host_id: "host".into(),
        account_scope: "account".into(),
        label: "Project".into(),
        path: worktree,
        source_path: Some(source.clone()),
        path_identity: None,
        source_identity: None,
        can_write: true,
        revoked: false,
    }
    .bind_identity()
    .unwrap();
    Fixture {
        _temp: temp,
        source,
        storage,
        grant,
    }
}

fn agent_edits(grant: &Grant) -> String {
    std::fs::write(grant.path.join("notes.txt"), "Agent note\n").unwrap();
    std::fs::create_dir(grant.path.join("docs")).unwrap();
    std::fs::write(grant.path.join("docs/new.txt"), "Brand new\n").unwrap();
    std::fs::remove_file(grant.path.join("gone.txt")).unwrap();
    reviewed(grant)
}

fn reviewed(grant: &Grant) -> String {
    let snapshot = snapshot_for_publish(grant).unwrap();
    snapshot["snapshotSha256"].as_str().unwrap().to_owned()
}

fn read(root: &Path, path: &str) -> Option<String> {
    std::fs::read_to_string(root.join(path)).ok()
}

#[test]
fn apply_lands_reviewed_bytes_as_uncommitted_source_changes() {
    let f = fixture();
    let fingerprint = agent_edits(&f.grant);
    std::fs::write(f.source.join("other.txt"), "User edit\n").unwrap();
    let result = apply_reviewed(&f.grant, &fingerprint).unwrap();
    assert_eq!(result["applied"], true, "{result}");
    assert_eq!(
        read(&f.source, "notes.txt").as_deref(),
        Some("Agent note\n")
    );
    assert_eq!(
        read(&f.source, "docs/new.txt").as_deref(),
        Some("Brand new\n")
    );
    assert_eq!(read(&f.source, "gone.txt"), None);
    assert_eq!(read(&f.source, "other.txt").as_deref(), Some("User edit\n"));
    assert_eq!(git(&f.source, &["rev-list", "--count", "HEAD"]).trim(), "1");
    assert!(git(&f.source, &["status", "--porcelain"]).contains(" M notes.txt"));
    let again = apply_reviewed(&f.grant, &fingerprint).unwrap();
    assert_eq!(again["applied"], true);
    assert_eq!(again["files"].as_array().unwrap().len(), 0, "{again}");
}

#[test]
fn apply_refuses_every_file_when_the_user_changed_a_same_path() {
    let f = fixture();
    let fingerprint = agent_edits(&f.grant);
    std::fs::write(f.source.join("notes.txt"), "User rewrite\n").unwrap();
    let result = apply_reviewed(&f.grant, &fingerprint).unwrap();
    assert_eq!(result["applied"], false);
    assert_eq!(result["conflicts"][0]["path"], "notes.txt", "{result}");
    assert_eq!(
        read(&f.source, "notes.txt").as_deref(),
        Some("User rewrite\n")
    );
    assert_eq!(read(&f.source, "docs/new.txt"), None);
    assert_eq!(read(&f.source, "gone.txt").as_deref(), Some("Delete me\n"));
}

#[test]
fn apply_refuses_a_stale_or_unknown_fingerprint() {
    let f = fixture();
    let fingerprint = agent_edits(&f.grant);
    std::fs::write(f.grant.path.join("notes.txt"), "Edited after review\n").unwrap();
    assert!(apply_reviewed(&f.grant, &fingerprint).is_err());
    assert!(apply_reviewed(&f.grant, &"0".repeat(64)).is_err());
    assert_eq!(
        read(&f.source, "notes.txt").as_deref(),
        Some("Original note\n")
    );
    assert_eq!(read(&f.source, "docs/new.txt"), None);
}

#[cfg(unix)]
#[test]
fn apply_never_writes_through_a_linked_source_path() {
    let f = fixture();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), f.source.join("docs")).unwrap();
    let fingerprint = agent_edits(&f.grant);
    let result = apply_reviewed(&f.grant, &fingerprint).unwrap();
    assert_eq!(result["applied"], false);
    assert_eq!(result["conflicts"][0]["path"], "docs/new.txt", "{result}");
    assert!(!outside.path().join("new.txt").exists());
    assert_eq!(
        read(&f.source, "notes.txt").as_deref(),
        Some("Original note\n")
    );
}

#[test]
fn discard_removes_only_the_managed_worktree_and_its_branch() {
    let f = fixture();
    agent_edits(&f.grant);
    let elsewhere = f.storage.parent().unwrap().join("elsewhere");
    std::fs::create_dir(&elsewhere).unwrap();
    assert!(discard(&f.grant, &elsewhere).is_err());
    let mut escaped = f.grant.clone();
    escaped.path = f.source.clone();
    assert!(discard(&escaped, &f.storage).is_err());
    assert!(f.grant.path.exists());
    let result = discard(&f.grant, &f.storage).unwrap();
    assert_eq!(result["branchDeleted"], true, "{result}");
    assert!(!f.grant.path.exists());
    assert!(!git(&f.source, &["branch", "--list"]).contains("vibyra-agent/"));
    assert_eq!(
        read(&f.source, "notes.txt").as_deref(),
        Some("Original note\n")
    );
    assert!(git(&f.source, &["status", "--porcelain"]).is_empty());
}
