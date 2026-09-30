use super::{edit, open, read, review_git, safe_path};
use crate::agent_computer_store::Grant;
use serde_json::json;

#[test]
fn private_and_escaping_paths_are_never_read() {
    for path in [
        "../secret",
        "/tmp/file",
        ".env",
        ".env.local",
        "node_modules/a",
        ".git/config",
        "a/../../b",
    ] {
        assert!(!safe_path(path), "{path}");
    }
    assert!(safe_path("src/main.rs"));
    assert!(safe_path(""));
}

#[test]
fn a_real_project_can_be_listed_read_and_searched_without_exposing_hidden_files() {
    let root = tempfile::tempdir().unwrap();
    let state = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("README.md"), "Everyday project notes\n").unwrap();
    std::fs::write(root.path().join(".env.local"), "PRIVATE=fixture\n").unwrap();
    let grant = Grant {
        id: "123e4567-e89b-12d3-a456-426614174000".into(),
        agent_id: "123e4567-e89b-12d3-a456-426614174001".into(),
        host_id: "host".into(),
        account_scope: "account".into(),
        label: "Project".into(),
        path: root.path().canonicalize().unwrap(),
        source_path: None,
        can_write: false,
        revoked: false,
    };
    let engine = open(&grant, state.path()).unwrap();
    let files = read(&grant, &engine, "list_files", &json!({"path":""}));
    assert_eq!(files["entries"].as_array().unwrap().len(), 1);
    let file = read(&grant, &engine, "read_file", &json!({"path":"README.md"}));
    assert_eq!(file["content"], "Everyday project notes\n");
    assert_eq!(file["sha256"].as_str().unwrap().len(), 64);
    assert!(read(&grant, &engine, "read_file", &json!({"path":".env.local"}))["error"].is_string());
    let found = read(
        &grant,
        &engine,
        "search_files",
        &json!({"query":"Everyday"}),
    );
    assert_eq!(found["matches"][0]["path"], "README.md", "{found}");
    let private = read(&grant, &engine, "search_files", &json!({"query":"PRIVATE"}));
    assert_eq!(private["matches"].as_array().unwrap().len(), 0);
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(".env.local", root.path().join("public.txt")).unwrap();
        assert!(
            read(&grant, &engine, "read_file", &json!({"path":"public.txt"}))["error"].is_string()
        );
        let private = read(&grant, &engine, "search_files", &json!({"query":"PRIVATE"}));
        assert_eq!(private["matches"].as_array().unwrap().len(), 0);
    }
}

#[test]
fn approved_mac_edit_has_a_durable_receipt_and_cannot_replay_a_changed_action() {
    let root = tempfile::tempdir().unwrap();
    let state = tempfile::tempdir().unwrap();
    let mut grant = Grant {
        id: "123e4567-e89b-12d3-a456-426614174000".into(),
        agent_id: "123e4567-e89b-12d3-a456-426614174001".into(),
        host_id: "host".into(),
        account_scope: "account".into(),
        label: "Project".into(),
        path: root.path().canonicalize().unwrap(),
        source_path: Some(root.path().canonicalize().unwrap()),
        can_write: true,
        revoked: false,
    };
    let expires = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 600;
    let request = json!({
        "id":"123e4567-e89b-12d3-a456-426614174002",
        "turnId":"123e4567-e89b-12d3-a456-426614174003",
        "operation":"write_file", "expiresAt":expires,
        "approval":{"state":"dispatching","fingerprint":"a".repeat(64)},
        "arguments":{"path":"notes.txt","content":"Approved note\n","expectedSha256":"new"}
    });
    let engine = open(&grant, state.path()).unwrap();
    let mut unapproved = request.clone();
    unapproved["approval"]["state"] = json!("pending");
    assert!(edit(&grant, &engine, &unapproved)["error"].is_string());
    grant.can_write = false;
    assert!(edit(&grant, &engine, &request)["error"].is_string());
    grant.can_write = true;
    let receipt = edit(&grant, &engine, &request);
    assert_eq!(receipt["written"], true, "{receipt}");
    assert_eq!(
        std::fs::read_to_string(root.path().join("notes.txt")).unwrap(),
        "Approved note\n"
    );
    std::fs::write(root.path().join("notes.txt"), "External edit\n").unwrap();
    assert_eq!(edit(&grant, &engine, &request), receipt);
    let mut changed = request.clone();
    changed["arguments"]["content"] = json!("Different content");
    assert!(edit(&grant, &engine, &changed)["error"].is_string());
    assert_eq!(
        std::fs::read_to_string(root.path().join("notes.txt")).unwrap(),
        "External edit\n"
    );
}

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
        can_write: true,
        revoked: false,
    };
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
