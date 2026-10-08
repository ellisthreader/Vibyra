use super::*;
use std::process::Command;

const ID: &str = "123e4567-e89b-12d3-a456-426614174000";

fn git(root: &Path, args: &[&str]) {
    assert!(Command::new("git")
        .args(args)
        .current_dir(root)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .status()
        .unwrap()
        .success());
}

fn fixture() -> (tempfile::TempDir, Grant) {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    std::fs::create_dir(&source).unwrap();
    git(&source, &["init", "--quiet"]);
    git(&source, &["config", "user.name", "Fixture"]);
    git(&source, &["config", "user.email", "fixture@example.test"]);
    std::fs::write(source.join("notes.txt"), "before\n").unwrap();
    git(&source, &["add", "notes.txt"]);
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
    (temp, grant)
}

fn approved(current: &Value) -> Value {
    json!({"baseSha":current["baseSha"], "branch":current["branch"],
        "snapshotSha256":current["snapshotSha256"], "files":current["files"],
        "totalBytes":current["totalBytes"]})
}

#[test]
fn uploads_only_the_exact_approved_worktree_bytes() {
    let (_temp, grant) = fixture();
    std::fs::write(grant.path.join("notes.txt"), "after\n").unwrap();
    let first = publish_snapshot::read(&grant).unwrap();
    let upload = build(&grant, &approved(&first)).unwrap();
    assert_eq!(upload["files"][0]["contentBase64"], "YWZ0ZXIK");
    assert_eq!(upload["files"][0]["status"], " M");
    std::fs::write(grant.path.join("notes.txt"), "later\n").unwrap();
    assert!(build(&grant, &approved(&first)).is_err());
}

#[test]
fn added_private_change_blocks_the_whole_upload() {
    let (_temp, grant) = fixture();
    std::fs::write(grant.path.join("notes.txt"), "after\n").unwrap();
    let first = publish_snapshot::read(&grant).unwrap();
    std::fs::write(grant.path.join(".env"), "SECRET=not-for-github\n").unwrap();
    assert!(build(&grant, &approved(&first)).is_err());
}

#[cfg(unix)]
#[test]
fn a_replaced_worktree_folder_cannot_redirect_the_upload() {
    let (temp, grant) = fixture();
    std::fs::write(grant.path.join("notes.txt"), "after\n").unwrap();
    let first = publish_snapshot::read(&grant).unwrap();
    // Same path, different directory object, same-looking bytes.
    std::fs::rename(&grant.path, temp.path().join("old-worktree")).unwrap();
    std::fs::create_dir(&grant.path).unwrap();
    std::fs::write(grant.path.join("notes.txt"), "after\n").unwrap();
    assert!(build(&grant, &approved(&first)).is_err());
    assert!(publish_snapshot::read_file(&grant, Path::new("notes.txt")).is_err());
}

#[cfg(unix)]
#[test]
fn a_symlink_swapped_in_for_a_changed_file_is_never_uploaded() {
    let (temp, grant) = fixture();
    let outside = temp.path().join("outside.txt");
    std::fs::write(&outside, "outside\n").unwrap();
    std::fs::write(grant.path.join("notes.txt"), "after\n").unwrap();
    let first = publish_snapshot::read(&grant).unwrap();
    std::fs::remove_file(grant.path.join("notes.txt")).unwrap();
    std::os::unix::fs::symlink(&outside, grant.path.join("notes.txt")).unwrap();
    assert!(build(&grant, &approved(&first)).is_err());
    assert!(publish_snapshot::read_file(&grant, Path::new("notes.txt")).is_err());
}

#[cfg(unix)]
#[test]
fn paths_that_leave_the_worktree_are_never_read() {
    let (temp, grant) = fixture();
    std::fs::write(temp.path().join("outside.txt"), "outside\n").unwrap();
    for path in ["../outside.txt", "/etc/hosts", "./notes.txt"] {
        assert!(
            publish_snapshot::read_file(&grant, Path::new(path)).is_err(),
            "{path}"
        );
    }
    assert!(publish_snapshot::read_file(&grant, Path::new("notes.txt")).is_ok());
}

#[cfg(unix)]
#[test]
fn a_grant_without_a_folder_identity_cannot_publish() {
    let (_temp, mut grant) = fixture();
    std::fs::write(grant.path.join("notes.txt"), "after\n").unwrap();
    let first = publish_snapshot::read(&grant).unwrap();
    grant.path_identity = None;
    assert!(build(&grant, &approved(&first)).is_err());
    assert!(publish_snapshot::read_file(&grant, Path::new("notes.txt")).is_err());
}
