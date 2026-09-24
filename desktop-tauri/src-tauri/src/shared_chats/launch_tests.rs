use super::*;
use vibyra_engine::DesktopConversationOptions;

#[test]
fn terminal_launch_preserves_settings_and_retries_without_another_worktree() {
    let (dir, chats, _) = super::fixture::fixture();
    std::fs::write(dir.path().join(".gitignore"), "*\n!README.md\n").unwrap();
    std::fs::write(dir.path().join("README.md"), "Original project\n").unwrap();
    for args in [
        vec!["init", "-q"],
        vec!["add", "README.md"],
        vec![
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "Initial",
        ],
    ] {
        assert!(std::process::Command::new("git")
            .args(args)
            .current_dir(dir.path())
            .status()
            .unwrap()
            .success());
    }
    let trees = tempfile::tempdir().unwrap();
    let options = DesktopConversationOptions {
        provider: Some("codex".into()),
        model: Some("gpt-6-astra".into()),
        reasoning_effort: Some("high".into()),
        full_access: false,
        worktrees_root: Some(trees.path().into()),
        safe_snapshot_fingerprint: None,
    };
    let create = |options| {
        chats.create_configured(
            "project".into(),
            "Project".into(),
            dir.path().into(),
            "default".into(),
            "55555555-5555-4555-a555-555555555555".into(),
            "Terminal".into(),
            Some(options),
        )
    };
    let first = create(options.clone()).unwrap();
    assert_eq!(
        chats
            .lookup_create(
                "project",
                "default",
                "codex",
                "55555555-5555-4555-a555-555555555555"
            )
            .unwrap()["id"],
        first["id"]
    );
    assert!(chats
        .lookup_create(
            "project",
            "default",
            "codex",
            "77777777-7777-4777-a777-777777777777"
        )
        .unwrap()
        .is_null());
    assert!(chats
        .lookup_create(
            "project",
            "other",
            "codex",
            "55555555-5555-4555-a555-555555555555"
        )
        .unwrap()
        .is_null());
    assert_eq!(create(options.clone()).unwrap()["id"], first["id"]);
    let lines = std::fs::read_to_string(dir.path().join("launches")).unwrap();
    let starts: Vec<Value> = lines
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(
        starts.len(),
        2,
        "original fixture plus one configured terminal"
    );
    let launch = &starts[1];
    assert_eq!(launch["model"], "gpt-6-astra");
    assert_eq!(launch["config"]["model_reasoning_effort"], "high");
    assert_eq!(launch["approvalPolicy"], "on-request");
    assert_eq!(launch["sandbox"], "workspace-write");
    let cwd = PathBuf::from(launch["cwd"].as_str().unwrap());
    assert_ne!(cwd, dir.path());
    assert!(cwd.starts_with(trees.path().canonicalize().unwrap()));
    let snapshot = chats
        .local("conversation.snapshot", json!({"sessionId":first["id"]}))
        .unwrap();
    assert_eq!(snapshot["workingDirectory"], launch["cwd"]);
    assert_eq!(
        std::fs::read_to_string(cwd.join("README.md")).unwrap(),
        "Original project\n"
    );
    let before = std::fs::read_dir(trees.path()).unwrap().count();
    let mut changed = options;
    changed.full_access = true;
    assert!(create(changed).unwrap_err().contains("different action"));
    assert_eq!(std::fs::read_dir(trees.path()).unwrap().count(), before);
    chats.shutdown();
}

#[test]
fn phone_cannot_override_local_launch_permissions_or_workspace() {
    let (dir, chats, _) = super::fixture::fixture();
    let engine = chats.slots.lock()[0].engine.clone();
    engine.handle("phone", "session.create", json!({"projectId":"project",
        "requestId":"66666666-6666-4666-a666-666666666666","title":"Remote","kind":"codex","runner":"conversation",
        "fullAccess":true,"sandbox":"danger-full-access","cwd":"/","model":"injected"})).unwrap();
    let lines = std::fs::read_to_string(dir.path().join("launches")).unwrap();
    let launch: Value = serde_json::from_str(lines.lines().last().unwrap()).unwrap();
    assert_eq!(launch["sandbox"], "workspace-write");
    assert_eq!(launch["approvalPolicy"], "on-request");
    assert_eq!(launch["model"], Value::Null);
    assert_eq!(
        PathBuf::from(launch["cwd"].as_str().unwrap()),
        dir.path().canonicalize().unwrap()
    );
    chats.shutdown();
}
