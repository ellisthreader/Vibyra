use super::{stream, terminal_attachment::before_request, tests::setup};
use serde_json::json;

#[test]
fn native_turn_revokes_remote_control_and_streams_one_durable_user_message() {
    let (dir, engine, p) = setup();
    let mut start = json!({"method":"turn/start","params":{"threadId":"thread","model":"model","effort":"high"}});
    before_request(&engine.shared, "session", &mut start).unwrap();
    assert!(engine.shared.lock().sessions["session"].lease.is_none());
    assert!(engine.handle("phone", "turn.interrupt", p).is_err());
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"turn/started","params":{"threadId":"thread","turn":{"id":"native-turn"}}}),
    );
    let message = json!({"method":"item/completed","params":{"threadId":"thread","turnId":"native-turn",
        "item":{"id":"native-message","type":"userMessage","content":[{"type":"text","text":"From the real terminal"}]}}});
    stream::receive(&engine.shared, "session", message.clone());
    stream::receive(&engine.shared, "session", message);
    let snapshot = engine
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(snapshot["items"].as_array().unwrap().len(), 1);
    assert_eq!(snapshot["items"][0]["text"], "From the real terminal");
    drop(engine);
    std::thread::sleep(std::time::Duration::from_millis(300));
    let reopened = crate::Engine::new(
        dir.path().join("state"),
        vec![("project".into(), dir.path().into())],
    )
    .unwrap();
    let saved = reopened
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(saved["items"][0]["text"], "From the real terminal");
}
#[test]
fn resume_cannot_replace_account_worktree_or_policy_and_keeps_pagination() {
    let (_dir, engine, _) = setup();
    let mut request = json!({"method":"thread/resume","params":{"threadId":"thread","cwd":"/another",
        "model":"another","sandbox":"danger-full-access","initialTurnsPage":{"limit":20}}});
    before_request(&engine.shared, "session", &mut request).unwrap();
    assert_eq!(
        request["params"],
        json!({"threadId":"thread","excludeTurns":true,"initialTurnsPage":{"limit":20}})
    );
}
#[test]
fn concurrent_native_turn_and_provider_rejection_do_not_leave_stuck_execution() {
    let (_dir, engine, _) = setup();
    let mut start = json!({"method":"turn/start","params":{"threadId":"thread"}});
    before_request(&engine.shared, "session", &mut start).unwrap();
    assert!(before_request(&engine.shared, "session", &mut start).is_err());
    before_request(
        &engine.shared,
        "session",
        &mut json!({"method":"vibyra/terminalFailed"}),
    )
    .unwrap();
    assert_eq!(
        engine.shared.lock().conversations["session"].turn_state,
        "failed"
    );
    assert!(before_request(&engine.shared, "session", &mut start).is_ok());
}

#[test]
fn native_steering_is_not_hidden_by_a_phone_submission_and_settings_stay_shared() {
    let (_dir, engine, _) = setup();
    {
        let mut state = engine.shared.lock();
        let c = state.conversations.get_mut("session").unwrap();
        c.active_submission = Some("phone-message".into());
        c.receipts
            .insert("phone-message".into(), json!({"status":"accepted"}));
    }
    for (id, client, text) in [
        ("echo", "phone-message", "Already saved"),
        ("steer", "native-steer", "Additional native instruction"),
    ] {
        stream::receive(
            &engine.shared,
            "session",
            json!({"method":"item/completed",
            "params":{"threadId":"thread","turnId":"turn","item":{"id":id,
                "clientId":client,"type":"userMessage","content":[{"type":"text","text":text}]}}}),
        );
    }
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"thread/settings/updated",
        "params":{"threadId":"thread","threadSettings":{"model":"new-model","effort":"high",
            "approvalPolicy":"on-request","sandboxPolicy":{"type":"readOnly"}}}}),
    );
    let state = engine.shared.lock();
    let c = &state.conversations["session"];
    assert_eq!(c.items.len(), 1);
    assert_eq!(c.items[0]["text"], "Additional native instruction");
    assert_eq!(c.settings["model"], "new-model");
    assert_eq!(c.settings["sandbox"]["type"], "readOnly");
}

#[test]
fn old_process_exit_cannot_close_a_resumed_conversation() {
    let (_dir, engine, _) = setup();
    let previous = engine.shared.lock().conversations["session"]
        .generation
        .clone();
    engine
        .shared
        .lock()
        .conversations
        .get_mut("session")
        .unwrap()
        .generation = "new-runtime".into();
    stream::receive_generation(
        &engine.shared,
        "session",
        &previous,
        json!({"method":"vibyra/processExited"}),
    );
    assert_eq!(
        engine.shared.lock().conversations["session"].process_state,
        "running"
    );
    stream::receive_generation(
        &engine.shared,
        "session",
        "new-runtime",
        json!({"method":"vibyra/processExited"}),
    );
    assert_eq!(
        engine.shared.lock().conversations["session"].process_state,
        "interrupted"
    );
}
