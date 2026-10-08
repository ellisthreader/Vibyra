use super::{fixture::fixture, *};

#[test]
fn phone_resumes_saved_thread_with_typing_and_exact_identity_then_sends_once() {
    let (dir, chats, session) = fixture();
    let id = session["id"].as_str().unwrap();
    chats
        .local("session.stop", json!({"sessionId":id}))
        .unwrap();
    let before = chats
        .remote(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":id}),
            true,
        )
        .unwrap();
    assert_eq!(before["canResume"], true);
    let params =
        json!({"sessionId":id,"projectId":before["projectId"],"generation":before["generation"]});
    assert!(chats
        .remote("phone", "conversation.resume", params.clone(), false)
        .is_err());
    for key in ["projectId", "generation"] {
        let mut wrong = params.clone();
        wrong[key] = json!("wrong");
        assert!(chats
            .remote("phone", "conversation.resume", wrong, true)
            .is_err());
    }
    assert_eq!(
        chats
            .remote("phone", "conversation.resume", params.clone(), true)
            .unwrap()["id"],
        id
    );
    let after = chats
        .remote(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":id}),
            true,
        )
        .unwrap();
    assert_eq!(after["processState"], "running");
    assert_eq!(before["items"], after["items"]);
    assert_eq!(before["workingDirectory"], after["workingDirectory"]);
    assert_ne!(before["generation"], after["generation"]);
    assert!(chats
        .remote("phone", "conversation.resume", params, true)
        .is_err());
    assert!(
        !dir.path().join("effects").exists(),
        "resuming never repeats old work"
    );
    let lease = chats
        .remote("phone", "session.claim", json!({"sessionId":id}), true)
        .unwrap();
    let turn = json!({"sessionId":id,"projectId":after["projectId"],"generation":lease["generation"],
        "lease":lease["lease"],"submissionId":"44444444-4444-4444-a444-444444444444","text":"Continue the saved task"});
    assert_eq!(
        chats
            .remote("phone", "turn.submit", turn.clone(), true)
            .unwrap()["status"],
        "accepted"
    );
    assert_eq!(
        chats.remote("phone", "turn.submit", turn, true).unwrap()["status"],
        "accepted"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("effects"))
            .unwrap()
            .lines()
            .count(),
        1
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("launches"))
            .unwrap()
            .lines()
            .count(),
        2
    );
    chats.shutdown();
}
