use super::{batching, question_tool, stream, tests::setup};
use serde_json::json;
use std::{sync::mpsc, time::Duration};

#[test]
fn running_command_output_is_live_bounded_and_authoritatively_replaced() {
    let (_dir, engine, _) = setup();
    let raw = json!({"id":"cmd","type":"commandExecution","command":"npm test","status":"inProgress","aggregatedOutput":""});
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"item/started","params":{"threadId":"thread","turnId":"turn","item":raw}}),
    );
    let delta = |text: &str| json!({"method":"item/commandExecution/outputDelta","params":{"threadId":"thread","turnId":"turn","itemId":"cmd","delta":text}});
    stream::receive(&engine.shared, "session", delta("Running tests…\n"));
    let snapshot = engine
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(snapshot["items"][0]["detail"], "npm test\nRunning tests…\n");
    assert_eq!(snapshot["items"][0]["status"], "running");
    stream::receive(&engine.shared, "session", delta(&"😀".repeat(3000)));
    stream::receive(&engine.shared, "session", delta(""));
    let snapshot = engine
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    let item = &snapshot["items"][0];
    assert!(item["detail"].as_str().unwrap().len() <= 8192);
    assert!(item["detail"].as_str().unwrap().starts_with("npm test\n"));
    assert_eq!(item["truncated"], true);
    let mut completed = raw;
    completed["status"] = json!("completed");
    completed["aggregatedOutput"] = json!("2 tests passed\n");
    completed["exitCode"] = json!(0);
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"item/completed","params":{"threadId":"thread","turnId":"turn","item":completed}}),
    );
    stream::receive(
        &engine.shared,
        "session",
        delta("late output must not reopen a completed item"),
    );
    let snapshot = engine
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(snapshot["items"][0]["detail"], "npm test\n2 tests passed\n");
    assert_eq!(snapshot["items"][0]["status"], "completed");
    assert_eq!(snapshot["items"][0]["truncated"], false);
}
#[test]
fn command_batches_flush_live_and_keep_method_and_item_identity() {
    let (tx, rx) = mpsc::channel();
    let sender = batching::dispatch(move |event| {
        tx.send(event).unwrap();
    });
    let event = |method: &str, id: &str, delta: &str| json!({"method":method,"params":{"threadId":"thread","turnId":"turn","itemId":id,"delta":delta}});
    for _ in 0..100 {
        sender
            .send(event("item/commandExecution/outputDelta", "cmd", "x"))
            .unwrap();
    }
    assert_eq!(
        rx.recv_timeout(Duration::from_secs(1)).unwrap()["params"]["delta"],
        "x".repeat(100)
    );
    sender
        .send(event("item/commandExecution/outputDelta", "cmd", "output"))
        .unwrap();
    sender
        .send(event("item/agentMessage/delta", "cmd", "assistant"))
        .unwrap();
    sender
        .send(event(
            "item/commandExecution/outputDelta",
            "other",
            "different",
        ))
        .unwrap();
    sender.send(json!({"method":"item/completed"})).unwrap();
    drop(sender);
    let events: Vec<_> = rx.iter().collect();
    assert_eq!(events.len(), 4);
    assert_eq!(events[0]["params"]["delta"], "output");
    assert_eq!(events[1]["params"]["delta"], "assistant");
    assert_eq!(events[2]["params"]["itemId"], "other");
    assert_eq!(events[3]["method"], "item/completed");
}
#[test]
fn duplicate_question_labels_are_rejected() {
    assert!(!question_tool::valid(
        &json!([{"id":"colour","question":"Which?","options":[{"label":"Blue"},{"label":"Blue"}]}])
    ));
    assert!(question_tool::valid(
        &json!([{"id":"colour","question":"Which?","options":[{"label":"Blue"},{"label":"Green"}]}])
    ));
}
