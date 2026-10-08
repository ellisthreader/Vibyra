use super::{edit, open, read, safe_path};
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

#[cfg(unix)]
#[test]
fn a_replaced_grant_folder_is_not_read_through_an_open_engine() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("project");
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("notes.txt"), "Selected project\n").unwrap();
    let root = root.canonicalize().unwrap();
    let grant = Grant {
        id: "123e4567-e89b-12d3-a456-426614174000".into(),
        agent_id: "123e4567-e89b-12d3-a456-426614174001".into(),
        host_id: "host".into(),
        account_scope: "account".into(),
        label: "Project".into(),
        path: root.clone(),
        source_path: None,
        path_identity: None,
        source_identity: None,
        can_write: false,
        revoked: false,
    }
    .bind_identity()
    .unwrap();
    let state = tempfile::tempdir().unwrap();
    let engine = open(&grant, state.path()).unwrap();
    std::fs::rename(&root, dir.path().join("old-project")).unwrap();
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("notes.txt"), "Different project\n").unwrap();
    assert!(read(&grant, &engine, "read_file", &json!({"path":"notes.txt"}))["error"].is_string());
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
        path_identity: None,
        source_identity: None,
        can_write: false,
        revoked: false,
    }
    .bind_identity()
    .unwrap();
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
        path_identity: None,
        source_identity: None,
        can_write: true,
        revoked: false,
    }
    .bind_identity()
    .unwrap();
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
