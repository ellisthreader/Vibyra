use super::{fixture::fixture, *};

fn reopen_after_shutdown(dir: &std::path::Path) -> Engine {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        match Engine::for_desktop_project(
            dir.join("journal"),
            "project".into(),
            "Project".into(),
            dir.into(),
            dir.join("provider"),
            vec![],
        ) {
            Ok(engine) => return engine,
            Err(error)
                if error == "another Vibyra Host already owns this state directory"
                    && std::time::Instant::now() < deadline =>
            {
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            Err(error) => panic!("could not reopen the stopped conversation engine: {error}"),
        }
    }
}

#[test]
fn stopped_codex_resumes_exact_identity_without_resubmitting_work() {
    let (dir, chats, session) = fixture();
    let id = session["id"].as_str().unwrap();
    let engine = chats.engine(id).unwrap();
    let before = engine
        .handle("desktop", "conversation.snapshot", json!({"sessionId":id}))
        .unwrap();
    chats
        .local("session.stop", json!({"sessionId":id}))
        .unwrap();
    let resumed = chats
        .local(
            "conversation.resume",
            json!({"sessionId":id,"accountId":"wrong","cwd":"/wrong","threadId":"wrong"}),
        )
        .unwrap();
    assert_eq!(resumed["id"], session["id"]);
    assert_eq!(resumed["status"], "running");
    let after = engine
        .handle("desktop", "conversation.snapshot", json!({"sessionId":id}))
        .unwrap();
    assert_ne!(before["generation"], after["generation"]);
    assert_eq!(before["workingDirectory"], after["workingDirectory"]);
    // A duplicate click reuses the same running thread, not another process.
    chats
        .local("conversation.resume", json!({"sessionId":id}))
        .unwrap();
    let launches = std::fs::read_to_string(dir.path().join("launches")).unwrap();
    let requests: Vec<Value> = launches
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1]["threadId"], "fixture-thread");
    assert!(!dir.path().join("effects").exists());
    assert!(chats
        .remote(
            "phone",
            "conversation.resume",
            json!({"sessionId":id}),
            true
        )
        .is_err());
    chats.shutdown();
}

#[test]
fn cold_resume_twice_and_failed_resume_preserve_history() {
    let (dir, chats, session) = fixture();
    let id = session["id"].as_str().unwrap();
    chats.local("turn.submit", json!({"sessionId":id,"submissionId":"33333333-3333-4333-a333-333333333333","text":"retained fixture message"})).unwrap();
    chats.shutdown();
    drop(chats);
    for _ in 0..2 {
        let engine = reopen_after_shutdown(dir.path());
        let before = engine
            .handle("desktop", "conversation.snapshot", json!({"sessionId":id}))
            .unwrap();
        assert_eq!(before["processState"], "interrupted");
        std::fs::write(dir.path().join("fail-resume"), "fail").unwrap();
        assert!(engine.resume_desktop_conversation(id).is_err());
        let failed = engine
            .handle("desktop", "conversation.snapshot", json!({"sessionId":id}))
            .unwrap();
        assert_eq!(failed["items"], before["items"]);
        std::fs::remove_file(dir.path().join("fail-resume")).unwrap();
        assert_eq!(engine.resume_desktop_conversation(id).unwrap()["id"], id);
        let after = engine
            .handle("desktop", "conversation.snapshot", json!({"sessionId":id}))
            .unwrap();
        assert_eq!(after["items"], before["items"]);
        engine.shutdown_conversations();
        drop(engine);
    }
    assert_eq!(
        std::fs::read_to_string(dir.path().join("effects"))
            .unwrap()
            .lines()
            .count(),
        1
    );
}
