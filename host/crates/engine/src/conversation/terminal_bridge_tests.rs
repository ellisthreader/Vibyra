use super::terminal_bridge::Bridge;
use serde_json::json;
use std::sync::{mpsc, Arc};

fn bridge() -> (Bridge, mpsc::Receiver<serde_json::Value>) {
    let bridge = Bridge::new(
        "thread".into(),
        json!({"userAgent":"codex"}),
        Arc::new(|_| Ok(())),
        tempfile::tempdir().unwrap(),
    );
    let (tx, rx) = mpsc::sync_channel(256);
    *bridge.peer.lock() = Some(tx);
    (bridge, rx)
}
#[test]
fn cli_initializes_without_reinitializing_engine_and_routes_colliding_ids() {
    let (b, rx) = bridge();
    assert!(b
        .client(json!({"id":1,"method":"initialize"}))
        .unwrap()
        .is_none());
    assert_eq!(
        rx.recv().unwrap(),
        json!({"id":1,"result":{"userAgent":"codex"}})
    );
    let request = b
        .client(json!({"id":1,"method":"model/list","params":{}}))
        .unwrap()
        .unwrap();
    assert_ne!(request["id"], 1);
    assert!(!b.provider(&json!({"id":"host-request","result":{}})));
    assert!(b.provider(&json!({"id":request["id"],"result":{"models":[]}})));
    assert_eq!(rx.recv().unwrap()["id"], 1);
}
#[test]
fn switching_threads_is_rejected_without_dispatch() {
    let (b, _) = bridge();
    for method in [
        "thread/start",
        "thread/fork",
        "thread/archive",
        "thread/unsubscribe",
    ] {
        assert!(b
            .client(json!({"id":1,"method":method,"params":{}}))
            .is_err());
    }
    assert!(b
        .client(json!({"id":1,"method":"thread/resume","params":{"threadId":"another"}}))
        .is_err());
    assert!(b
        .client(json!({"id":1,"method":"thread/resume","params":{"threadId":"thread"}}))
        .is_ok());
}
#[test]
fn either_client_may_answer_but_only_one_response_reaches_codex() {
    let (b, rx) = bridge();
    b.provider(&json!({"id":99,"method":"item/commandExecution/requestApproval","params":{"threadId":"thread"}}));
    assert_eq!(rx.recv().unwrap()["id"], 99);
    let answer = json!({"id":99,"result":{"decision":"accept"}});
    assert!(b.client(answer.clone()).is_ok());
    assert!(b.claim_response(&answer).is_ok());
    assert!(b.claim_response(&answer).is_err());
    assert!(b.client(answer).is_err());
}
#[test]
fn custom_questions_use_the_native_cli_question_ui_and_keep_phone_contract() {
    let (b, rx) = bridge();
    let questions = json!([{"id":"color","header":"Color","question":"Choose","options":[]}]);
    b.provider(&json!({"id":9,"method":"item/tool/call","params":{"threadId":"thread","turnId":"turn","callId":"call",
        "tool":"vibyra_ask_user","arguments":{"questions":questions}}}));
    let native = rx.recv().unwrap();
    assert_eq!(native["method"], "item/tool/requestUserInput");
    assert_eq!(native["params"]["questions"], questions);
    let response = b
        .client(json!({"id":9,"result":{"answers":{"color":{"answers":["Blue"]}}}}))
        .unwrap()
        .unwrap();
    assert_eq!(response["result"]["success"], true);
    assert!(response["result"]["contentItems"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Blue"));
}
#[test]
fn output_overflow_detaches_the_view_instead_of_freezing_the_engine() {
    let (b, _) = bridge();
    for _ in 0..257 {
        b.send(json!({"method":"output"}));
    }
    assert!(b.peer.lock().is_none());
}
