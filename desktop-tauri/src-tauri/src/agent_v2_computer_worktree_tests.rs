use super::*;

fn action(tool: &str, arguments: Value) -> Value {
    json!({"id": "11111111-2222-4333-8444-555555555555", "tool": tool, "workspaceId": "ws",
        "state": "dispatching", "claimedGeneration": 3, "fingerprint": "a".repeat(64),
        "arguments": arguments, "expiresAt": 1_900_000_000})
}

/// Temp Git repo + Agent worktree, as a Mac edit grant creates them.
fn worktree_grant() -> (tempfile::TempDir, crate::agent_computer_store::Grant) {
    use std::process::Command;
    const ID: &str = "123e4567-e89b-12d3-a456-426614174000";
    let git = |root: &std::path::Path, args: &[&str]| {
        assert!(Command::new("git")
            .args(args)
            .current_dir(root)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .status()
            .unwrap()
            .success());
    };
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
    let grant = crate::agent_computer_store::Grant {
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

#[test]
fn a_mapped_publish_uploads_the_approved_worktree_bytes_and_refuses_changed_ones() {
    use crate::agent_computer_tools::{snapshot_for_publish, upload_for_publish};
    let (_temp, grant) = worktree_grant();
    std::fs::write(grant.path.join("notes.txt"), "fixed\n").unwrap();
    let preview = snapshot_for_publish(&grant).unwrap();
    // The backend approves exactly this metadata (plus totalBytes) as `arguments.snapshot`.
    let approved = json!({"baseSha": preview["baseSha"], "branch": preview["branch"],
        "snapshotSha256": preview["snapshotSha256"], "files": preview["files"], "totalBytes": preview["totalBytes"]});
    let publish = action(
        "publish_branch",
        json!({"repository": "octo/app", "baseBranch": "main",
        "message": "Fix", "snapshot": approved, "expectedHeadSha": null}),
    );
    let request = v1_request(Op::Publish, &publish, "run-1");
    let receipt = publish_receipt(upload_for_publish(
        &grant,
        &request["arguments"]["snapshot"],
    ));
    assert_eq!(
        receipt["upload"]["snapshotSha256"],
        preview["snapshotSha256"]
    );
    assert_eq!(receipt["upload"]["files"][0]["contentBase64"], "Zml4ZWQK");
    // A second edit after approval: the Mac refuses instead of uploading other bytes.
    std::fs::write(grant.path.join("notes.txt"), "fixed twice\n").unwrap();
    let changed = publish_receipt(upload_for_publish(
        &grant,
        &request["arguments"]["snapshot"],
    ));
    assert!(changed["error"].is_string() && changed.get("upload").is_none());
    // The source checkout stays untouched until the person applies the worktree.
    assert_eq!(
        std::fs::read_to_string(grant.source_path.unwrap().join("notes.txt")).unwrap(),
        "before\n"
    );
}
