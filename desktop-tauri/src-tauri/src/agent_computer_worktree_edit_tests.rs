use super::{edit, open, read, review_git};
use crate::agent_computer_store::Grant;
use serde_json::json;

#[test]
fn approved_edit_changes_only_the_agent_worktree() {
    use std::process::Command;
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    std::fs::create_dir(&source).unwrap();
    let source = source.canonicalize().unwrap();
    let run = |args: &[&str]| {
        assert!(Command::new("git")
            .arg("-C")
            .arg(&source)
            .args(args)
            .status()
            .unwrap()
            .success());
    };
    run(&["init", "-q"]);
    run(&["config", "core.autocrlf", "false"]);
    std::fs::write(source.join("notes.txt"), "Original note\n").unwrap();
    run(&["add", "."]);
    run(&[
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-qm",
        "start",
    ]);
    let id = "123e4567-e89b-12d3-a456-426614174000";
    let worktree =
        vibyra_core::workspace_agent::prepare(&source, &temp.path().join("private"), id).unwrap();
    let grant = Grant {
        id: id.into(),
        agent_id: "123e4567-e89b-12d3-a456-426614174001".into(),
        host_id: "host".into(),
        account_scope: "account".into(),
        label: "Project".into(),
        path: worktree.clone(),
        source_path: Some(source.clone()),
        path_identity: None,
        source_identity: None,
        can_write: true,
        revoked: false,
    }
    .bind_identity()
    .unwrap();
    let state = tempfile::tempdir().unwrap();
    let engine = open(&grant, state.path()).unwrap();
    let original = read(&grant, &engine, "read_file", &json!({"path":"notes.txt"}));
    assert_eq!(original["content"], "Original note\n");
    let expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 600;
    let receipt = edit(
        &grant,
        &engine,
        &json!({
            "id":"123e4567-e89b-12d3-a456-426614174002",
            "turnId":"123e4567-e89b-12d3-a456-426614174003",
            "operation":"write_file", "expiresAt":expiry,
            "approval":{"state":"dispatching","fingerprint":"a".repeat(64)},
            "arguments":{"path":"notes.txt","content":"Agent note\n",
                "expectedSha256":original["sha256"]}
        }),
    );
    assert_eq!(receipt["written"], true, "{receipt}");
    assert_eq!(
        std::fs::read_to_string(source.join("notes.txt")).unwrap(),
        "Original note\n"
    );
    assert_eq!(
        std::fs::read_to_string(worktree.join("notes.txt")).unwrap(),
        "Agent note\n"
    );
    let status = read(&grant, &engine, "git_status", &json!({}));
    assert_eq!(status["files"][0]["path"], "notes.txt", "{status}");
    let reviewed = review_git(&grant, "git_diff", &json!({"path":"notes.txt"})).unwrap();
    assert!(reviewed["diff"].as_str().unwrap().contains("+Agent note"));
}
