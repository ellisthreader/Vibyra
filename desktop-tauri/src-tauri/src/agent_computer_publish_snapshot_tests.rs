use super::*;
use std::path::{Path, PathBuf};
use std::process::Command;

const ID: &str = "123e4567-e89b-12d3-a456-426614174000";

#[test]
fn manifest_digest_matches_the_backend_wire_contract() {
    let files = vec![json!({"path":"notes.txt","status":" M","previousPath":null,
        "sha256":"b".repeat(64),"mode":"100644","bytes":6})];
    assert_eq!(
        digest(&"a".repeat(40), &format!("vibyra-agent/{ID}"), &files).unwrap(),
        "5a71336f815c50623b7d933322f8e9cf4a9f231e5230769f9e4c661c8d2f8625"
    );
}

fn git(root: &Path, args: &[&str]) {
    assert!(
        Command::new("git")
            .args(args)
            .current_dir(root)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .status()
            .unwrap()
            .success(),
        "git {args:?}"
    );
}

fn fixture() -> (tempfile::TempDir, Grant, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    std::fs::create_dir(&source).unwrap();
    git(&source, &["init", "--quiet"]);
    git(&source, &["config", "user.name", "Fixture"]);
    git(&source, &["config", "user.email", "fixture@example.test"]);
    std::fs::write(source.join("notes.txt"), "before\n").unwrap();
    std::fs::write(source.join(".env"), "SECRET=before\n").unwrap();
    git(&source, &["add", "notes.txt", ".env"]);
    git(&source, &["commit", "--quiet", "-m", "seed"]);
    let worktree = temp.path().join("worktree");
    git(
        &source,
        &[
            "worktree",
            "add",
            "--quiet",
            "-b",
            &format!("vibyra-agent/{ID}"),
            worktree.to_str().unwrap(),
        ],
    );
    let grant = Grant {
        id: ID.into(),
        agent_id: ID.into(),
        host_id: "host".into(),
        account_scope: "account".into(),
        label: "Project".into(),
        path: worktree.canonicalize().unwrap(),
        source_path: Some(source.canonicalize().unwrap()),
        path_identity: None,
        source_identity: None,
        can_write: true,
        revoked: false,
    }
    .bind_identity()
    .unwrap();
    (temp, grant, worktree)
}

#[test]
fn snapshot_pins_base_branch_and_exact_visible_file_bytes() {
    let (_temp, grant, worktree) = fixture();
    std::fs::write(worktree.join("notes.txt"), "after\n").unwrap();
    let first = read(&grant).unwrap();
    assert_eq!(first["ready"], true);
    assert_eq!(first["branch"], format!("vibyra-agent/{ID}"));
    assert_eq!(first["baseSha"].as_str().unwrap().len(), 40);
    assert_eq!(first["files"][0]["path"], "notes.txt");
    assert_eq!(
        first["files"][0]["sha256"],
        format!("{:x}", Sha256::digest(b"after\n"))
    );
    assert_eq!(first["files"][0]["mode"], "100644");
    assert_eq!(first["files"][0]["bytes"], 6);
    assert_eq!(
        first["snapshotSha256"],
        read(&grant).unwrap()["snapshotSha256"]
    );
    std::fs::write(worktree.join("notes.txt"), "later\n").unwrap();
    assert_ne!(
        first["snapshotSha256"],
        read(&grant).unwrap()["snapshotSha256"]
    );
}

#[test]
fn private_and_linked_changes_block_a_complete_publish_snapshot() {
    let (_temp, grant, worktree) = fixture();
    std::fs::write(worktree.join("notes.txt"), "after\n").unwrap();
    std::fs::write(worktree.join(".env"), "SECRET=changed\n").unwrap();
    assert!(read(&grant).unwrap_err().contains("private"));
    std::fs::write(worktree.join(".env"), "SECRET=before\n").unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink("notes.txt", worktree.join("link.txt")).unwrap();
        assert!(read(&grant).unwrap_err().contains("private"));
    }
}

#[test]
fn deletions_and_additions_are_both_pinned_in_the_manifest() {
    let (_temp, grant, worktree) = fixture();
    std::fs::remove_file(worktree.join("notes.txt")).unwrap();
    std::fs::write(worktree.join("added.txt"), "new\n").unwrap();
    let snapshot = read(&grant).unwrap();
    assert_eq!(snapshot["files"].as_array().unwrap().len(), 2);
    assert_eq!(snapshot["files"][0]["path"], "added.txt");
    assert_eq!(
        snapshot["files"][0]["sha256"],
        format!("{:x}", Sha256::digest(b"new\n"))
    );
    assert_eq!(snapshot["files"][1]["path"], "notes.txt");
    assert!(snapshot["files"][1]["sha256"].is_null());
}

#[test]
fn oversized_files_and_wrong_branch_cannot_form_a_publish_snapshot() {
    let (_temp, grant, worktree) = fixture();
    std::fs::write(
        worktree.join("notes.txt"),
        vec![b'x'; MAX_FILE_BYTES as usize + 1],
    )
    .unwrap();
    assert!(read(&grant).is_err());
    std::fs::write(worktree.join("notes.txt"), "after\n").unwrap();
    git(&worktree, &["checkout", "--quiet", "-b", "another-branch"]);
    assert!(read(&grant).unwrap_err().contains("not the branch"));
}
