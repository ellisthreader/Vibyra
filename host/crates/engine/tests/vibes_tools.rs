use serde_json::{json, Value};
use tempfile::tempdir;
use vibyra_host_engine::Engine;

fn binding(engine: &Engine, project: &str, device: &str) -> Value {
    let mut p = json!({"projectId":project,"chatId":uuid::Uuid::new_v4().to_string(),
        "accountToken":uuid::Uuid::new_v4().to_string()});
    let b = engine.handle(device, "vibes.bind", p.clone()).unwrap();
    p["binding"] = b["binding"].clone();
    p
}
fn tool(scope: &Value, op: &str, path: &str) -> Value {
    let mut p = scope.clone();
    p["toolId"] = json!(uuid::Uuid::new_v4().to_string());
    p["operation"] = json!(op);
    p["path"] = json!(path);
    p["decision"] = json!("allow");
    p["expiresAt"] = json!(chrono::Utc::now().timestamp() + 900);
    p
}
#[test]
fn writes_require_exact_scope_and_replay_does_not_repeat_or_overwrite_external_edits() {
    let root = tempdir().unwrap();
    let state = tempdir().unwrap();
    let engine = Engine::new(
        state.path().into(),
        vec![("test".into(), root.path().into())],
    )
    .unwrap();
    let host = engine.handle("phone", "host.state", json!({})).unwrap();
    let project = host["projects"][0]["id"].as_str().unwrap();
    let scope = binding(&engine, project, "phone");
    let mut p = tool(&scope, "write_file", "hello.txt");
    p["content"] = json!("hello");
    p["expectedSha256"] = json!("new");
    assert!(engine
        .handle("other-phone", "vibes.tool", p.clone())
        .is_err());
    assert!(!root.path().join("hello.txt").exists());
    let result = engine.handle("phone", "vibes.tool", p.clone()).unwrap();
    assert_eq!(result["written"], true);
    std::fs::write(root.path().join("hello.txt"), "external edit").unwrap();
    assert_eq!(
        engine.handle("phone", "vibes.tool", p.clone()).unwrap(),
        result
    );
    assert_eq!(
        std::fs::read_to_string(root.path().join("hello.txt")).unwrap(),
        "external edit"
    );
    p["content"] = json!("changed");
    assert!(engine.handle("phone", "vibes.tool", p).is_err());
}
#[test]
fn declines_conflicts_traversal_and_symlinks_do_not_write() {
    let root = tempdir().unwrap();
    let state = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let engine = Engine::new(
        state.path().into(),
        vec![("test".into(), root.path().into())],
    )
    .unwrap();
    let host = engine.handle("phone", "host.state", json!({})).unwrap();
    let scope = binding(
        &engine,
        host["projects"][0]["id"].as_str().unwrap(),
        "phone",
    );
    let mut p = tool(&scope, "write_file", "declined.txt");
    p["content"] = json!("no");
    p["expectedSha256"] = json!("new");
    p["decision"] = json!("decline");
    assert_eq!(
        engine.handle("phone", "vibes.tool", p).unwrap()["declined"],
        true
    );
    assert!(!root.path().join("declined.txt").exists());
    for path in ["../outside.txt", ".env", ".git/config"] {
        let mut p = tool(&scope, "write_file", path);
        p["content"] = json!("no");
        p["expectedSha256"] = json!("new");
        assert!(engine.handle("phone", "vibes.tool", p).unwrap()["error"].is_string());
    }
    std::fs::write(root.path().join("existing.txt"), "original").unwrap();
    let mut p = tool(&scope, "write_file", "existing.txt");
    p["content"] = json!("changed");
    p["expectedSha256"] = json!("bad-hash");
    assert!(engine.handle("phone", "vibes.tool", p).unwrap()["error"].is_string());
    assert_eq!(
        std::fs::read_to_string(root.path().join("existing.txt")).unwrap(),
        "original"
    );
    #[cfg(unix)]
    {
        std::fs::write(outside.path().join("secret"), "untouched").unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret"), root.path().join("link"))
            .unwrap();
        let mut p = tool(&scope, "write_file", "link");
        p["content"] = json!("changed");
        p["expectedSha256"] = json!("new");
        assert!(engine.handle("phone", "vibes.tool", p).unwrap()["error"].is_string());
        assert_eq!(
            std::fs::read_to_string(outside.path().join("secret")).unwrap(),
            "untouched"
        );
    }
}
#[test]
fn binding_survives_restart_but_wrong_account_and_chat_are_rejected() {
    let root = tempdir().unwrap();
    let state = tempdir().unwrap();
    let scope;
    {
        let engine = Engine::new(
            state.path().into(),
            vec![("test".into(), root.path().into())],
        )
        .unwrap();
        let host = engine.handle("phone", "host.state", json!({})).unwrap();
        scope = binding(
            &engine,
            host["projects"][0]["id"].as_str().unwrap(),
            "phone",
        );
        let db = rusqlite::Connection::open(state.path().join("engine.sqlite3")).unwrap();
        db.execute(
            "VACUUM INTO ?1",
            [state
                .path()
                .join("snapshot.sqlite3")
                .to_string_lossy()
                .as_ref()],
        )
        .unwrap();
    }
    let recovery = tempdir().unwrap();
    std::fs::copy(
        state.path().join("snapshot.sqlite3"),
        recovery.path().join("engine.sqlite3"),
    )
    .unwrap();
    let engine = Engine::new(
        recovery.path().into(),
        vec![("test".into(), root.path().into())],
    )
    .unwrap();
    let rebound = engine
        .handle(
            "phone",
            "vibes.bind",
            json!({"projectId":scope["projectId"],
        "chatId":scope["chatId"],"accountToken":scope["accountToken"]}),
        )
        .unwrap();
    assert_eq!(rebound["binding"], scope["binding"]);
    let p = tool(&scope, "list_files", "");
    assert!(engine.handle("phone", "vibes.tool", p.clone()).unwrap()["entries"].is_array());
    for key in ["chatId", "accountToken"] {
        let mut changed = p.clone();
        changed[key] = json!(uuid::Uuid::new_v4().to_string());
        assert!(engine.handle("phone", "vibes.tool", changed).is_err());
    }
    let mut expired = tool(&scope, "write_file", "expired.txt");
    expired["expiresAt"] = json!(chrono::Utc::now().timestamp() - 1);
    expired["content"] = json!("no");
    expired["expectedSha256"] = json!("new");
    assert!(engine.handle("phone", "vibes.tool", expired).is_err());
    assert!(!root.path().join("expired.txt").exists());
}
#[test]
fn search_finds_matches_across_files_skips_denied_names_and_reports_truncation() {
    let root = tempdir().unwrap();
    let state = tempdir().unwrap();
    std::fs::write(
        root.path().join("Home.md"),
        "# Home\nSee the connector writes contract for details.\n",
    )
    .unwrap();
    std::fs::create_dir(root.path().join("01 Projects")).unwrap();
    std::fs::write(
        root.path().join("01 Projects/plan.md"),
        "The connector writes contract is settled.\nNothing else here.\n",
    )
    .unwrap();
    std::fs::create_dir(root.path().join(".git")).unwrap();
    std::fs::write(root.path().join(".git/HEAD"), "connector writes contract\n").unwrap();
    std::fs::write(
        root.path().join(".env"),
        "SECRET=connector writes contract\n",
    )
    .unwrap();
    let engine = Engine::new(
        state.path().into(),
        vec![("vault".into(), root.path().into())],
    )
    .unwrap();
    let host = engine.handle("phone", "host.state", json!({})).unwrap();
    let scope = binding(
        &engine,
        host["projects"][0]["id"].as_str().unwrap(),
        "phone",
    );
    let mut p = tool(&scope, "search_files", "");
    p["query"] = json!("connector writes contract");
    let result = engine.handle("phone", "vibes.tool", p).unwrap();
    let matches = result["matches"].as_array().unwrap();
    assert_eq!(
        matches.len(),
        2,
        "only the two real notes match, not .git or .env: {matches:?}"
    );
    let paths: Vec<_> = matches
        .iter()
        .map(|m| m["path"].as_str().unwrap())
        .collect();
    assert!(paths.contains(&"Home.md"));
    assert!(paths.iter().any(|p| p.contains("plan.md")));
    assert_eq!(result["truncated"], false);

    let mut empty = tool(&scope, "search_files", "");
    empty["query"] = json!("");
    assert!(engine.handle("phone", "vibes.tool", empty).unwrap()["error"].is_string());
}
#[test]
fn a_read_only_project_serves_reads_but_refuses_every_write() {
    let root = tempdir().unwrap();
    let state = tempdir().unwrap();
    std::fs::write(root.path().join("note.md"), "already here").unwrap();
    let engine =
        Engine::new_read_only(state.path().into(), "vault".into(), root.path().into()).unwrap();
    let host = engine.handle("phone", "host.state", json!({})).unwrap();
    let project = host["projects"][0]["id"].as_str().unwrap();
    let scope = binding(&engine, project, "phone");
    assert_eq!(
        engine
            .handle("phone", "vibes.tool", tool(&scope, "list_files", ""))
            .unwrap()["entries"][0]["name"],
        "note.md"
    );
    let mut p = tool(&scope, "write_file", "note.md");
    p["content"] = json!("changed");
    p["expectedSha256"] = json!("new");
    assert!(engine.handle("phone", "vibes.tool", p).unwrap()["error"].is_string());
    assert_eq!(
        std::fs::read_to_string(root.path().join("note.md")).unwrap(),
        "already here"
    );
}

#[test]
fn external_reads_require_device_approval_and_replay_without_repeating_the_adapter() {
    use std::cell::Cell;
    let root = tempdir().unwrap();
    let state = tempdir().unwrap();
    let engine =
        Engine::new_read_only(state.path().into(), "Railway".into(), root.path().into()).unwrap();
    let host = engine.handle("phone", "host.state", json!({})).unwrap();
    let scope = binding(
        &engine,
        host["projects"][0]["id"].as_str().unwrap(),
        "phone",
    );
    let count = Cell::new(0);
    let read = |_: &str, _: &Value| {
        count.set(count.get() + 1);
        Ok(json!({"content":"safe"}))
    };
    let request = tool(&scope, "read_file", "projects.json");
    assert!(engine
        .external_read("other", "vibes.tool", &request, read)
        .is_err());
    let result = engine
        .external_read("phone", "vibes.tool", &request, read)
        .unwrap();
    assert_eq!(result["content"], "safe");
    assert_eq!(
        engine
            .external_read("phone", "vibes.tool", &request, read)
            .unwrap(),
        result
    );
    for (op, decision, path) in [
        ("read_file", "decline", "projects.json"),
        ("write_file", "allow", "x"),
        ("read_file", "allow", "../private"),
        ("search_files", "allow", "x"),
    ] {
        let mut p = tool(&scope, op, path);
        p["decision"] = json!(decision);
        let result = engine
            .external_read("phone", "vibes.tool", &p, read)
            .unwrap();
        assert!(result["declined"] == true || result["error"].is_string());
    }
    assert_eq!(count.get(), 1);
}
