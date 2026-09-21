use super::*;
#[test]
fn corrupted_registry_never_becomes_an_empty_writable_registry() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("projects.json"), b"broken").unwrap();
    let chats = SharedChats::new(dir.path().into());
    assert!(chats.sessions().is_err());
    assert!(chats
        .create(
            "project".into(),
            "Project".into(),
            dir.path().into(),
            "default".into(),
            "request".into(),
            "Chat".into()
        )
        .is_err());
    assert_eq!(
        std::fs::read(dir.path().join("projects.json")).unwrap(),
        b"broken"
    );
}
#[test]
fn remote_allowlist_denies_execution_files_and_mutations_when_typing_is_off() {
    let dir = tempfile::tempdir().unwrap();
    let chats = SharedChats::new(dir.path().into());
    for method in [
        "scaffold.start",
        "session.create",
        "fs.read",
        "preview.start",
        "terminal.input",
        "terminal.resize",
    ] {
        assert!(chats
            .remote("phone", method, json!({}), true)
            .unwrap_err()
            .contains("unavailable"));
    }
    for method in [
        "turn.submit",
        "turn.interrupt",
        "decision.resolve",
        "question.answer",
        "session.claim",
    ] {
        assert!(chats
            .remote("phone", method, json!({}), false)
            .unwrap_err()
            .contains("Typing"));
    }
}

#[cfg(unix)]
#[test]
fn shared_identity_handoff_receipts_and_restart_preserve_one_execution() {
    let (dir, chats, session) = super::fixture::fixture();
    let id = session["id"].as_str().unwrap();
    let remote = chats
        .remote("phone", "session.claim", json!({"sessionId":id}), true)
        .unwrap();
    let params = json!({"sessionId":id,"submissionId":"22222222-2222-4222-a222-222222222222","text":"Hello"});
    assert_eq!(
        chats.local("turn.submit", params.clone()).unwrap()["status"],
        "accepted"
    );
    assert_eq!(
        chats.local("turn.submit", params).unwrap()["status"],
        "accepted"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("effects")).unwrap(),
        "executed\n"
    );
    assert!(chats.remote("phone","turn.submit",json!({"sessionId":id,"projectId":"project","generation":remote["generation"],
        "lease":remote["lease"],"submissionId":"33333333-3333-4333-a333-333333333333","text":"Stale phone"}),true).is_err());
    let remote = chats
        .remote("phone", "session.claim", json!({"sessionId":id}), true)
        .unwrap();
    assert_ne!(remote["lease"], Value::Null);
    let phone = chats
        .remote(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":id}),
            false,
        )
        .unwrap();
    assert_eq!(phone["projectId"], "project");
    assert_eq!(
        phone["items"],
        chats
            .local("conversation.snapshot", json!({"sessionId":id}))
            .unwrap()["items"]
    );
    chats.disconnected("phone");
    assert!(chats
        .remote("other", "session.claim", json!({"sessionId":id}), true)
        .is_ok());
    chats.shutdown();
    drop(chats);
    let mut restored = None;
    for _ in 0..100 {
        match Engine::for_desktop_project(
            dir.path().join("journal"),
            "project".into(),
            "Project".into(),
            dir.path().into(),
            "codex".into(),
            vec![],
        ) {
            Ok(engine) => {
                restored = Some(engine);
                break;
            }
            Err(error) if error.contains("already owns") => {
                std::thread::sleep(std::time::Duration::from_millis(10))
            }
            Err(error) => panic!("{error}"),
        }
    }
    let restored = restored.expect("old engine releases its journal after flusher shutdown");
    let history = restored
        .handle("desktop", "conversation.snapshot", json!({"sessionId":id}))
        .unwrap();
    assert_eq!(history["processState"], "interrupted");
    assert!(history["items"]
        .as_array()
        .unwrap()
        .iter()
        .any(|i| i["text"] == "Hello"));
    assert_eq!(
        std::fs::read_to_string(dir.path().join("effects")).unwrap(),
        "executed\n"
    );
}

#[cfg(unix)]
#[test]
fn removing_a_project_stops_sharing_and_preserves_private_journal() {
    let (dir, chats, session) = super::fixture::fixture();
    chats.remove_project("project").unwrap();
    assert!(!chats.owns(session["id"].as_str().unwrap()));
    assert!(chats.sessions().unwrap().is_empty());
    assert!(chats.projects().is_empty());
    assert!(dir.path().join("journal/engine.sqlite3").exists());
    assert_eq!(
        std::fs::read_to_string(dir.path().join("projects.json")).unwrap(),
        "[]"
    );
}
