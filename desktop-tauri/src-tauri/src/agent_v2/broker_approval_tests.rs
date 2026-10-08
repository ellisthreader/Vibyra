//! Writes waiting for approval, fenced runs, and the arming gate.

use super::*;
use crate::agent_v2::broker::call;

#[test]
fn a_write_waits_for_the_decision_then_returns_its_result() {
    let polls = Arc::new(AtomicUsize::new(0));
    let seen = polls.clone();
    let server = MockServer::start(move |request| {
        if request.method == "POST" {
            return (200, json!({"action": {"id": "act-1", "state": "pending_approval", "summary": "Send email",
                "fingerprint": "f".repeat(64)}}).to_string());
        }
        let state = if seen.fetch_add(1, Ordering::SeqCst) < 2 {
            "pending_approval"
        } else {
            "completed"
        };
        (
            200,
            json!({"action": {"id": "act-1", "state": state, "result": {"sent": true}}})
                .to_string(),
        )
    });
    let broker = broker(
        &server.base,
        json!({"tools": [entry("gmail_send", A, "write")]}),
    );
    let reply = runtime()
        .block_on(broker.handle(&call("gmail_send")))
        .unwrap();
    assert_eq!(reply["result"]["isError"], false);
    assert!(server
        .paths()
        .iter()
        .any(|path| path.ends_with(&format!("/runs/{RUN}/actions/act-1?generation=3"))));
    assert_eq!(polls.load(Ordering::SeqCst), 3);
}

#[test]
fn a_declined_write_and_a_fenced_run_are_errors_for_the_model() {
    let server = MockServer::start(|request| {
        if request.method == "POST" {
            return (
                409,
                json!({"ok": false, "code": "stale_lease", "error": "x"}).to_string(),
            );
        }
        (200, "{}".into())
    });
    let broker = broker(
        &server.base,
        json!({"tools": [entry("gmail_search", A, "read")]}),
    );
    let reply = runtime()
        .block_on(broker.handle(&call("gmail_search")))
        .unwrap();
    assert_eq!(reply["result"]["isError"], true);
    assert!(reply["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("stopped"));
    let declined = call::outcome(&json!({"state": "declined", "result": {"error": "declined"}}));
    assert_eq!(declined["isError"], true);
}

#[test]
fn calls_wait_for_the_runner_to_arm_the_broker() {
    let server = MockServer::start(|_| {
        (
            200,
            json!({"action": {"id": "x", "state": "completed", "result": {}}}).to_string(),
        )
    });
    let dir = tempfile::tempdir().unwrap();
    let mut broker = broker(
        &server.base,
        json!({"tools": [entry("gmail_search", A, "read")]}),
    );
    broker.armed_path = Some(dir.path().join("armed"));
    broker.arm_wait = Duration::from_millis(100);
    let rt = runtime();
    let reply = rt.block_on(broker.handle(&call("gmail_search"))).unwrap();
    assert_eq!(reply["result"]["isError"], true);
    assert!(server.paths().is_empty());
    std::fs::write(dir.path().join("armed"), "armed").unwrap();
    let reply = rt.block_on(broker.handle(&call("gmail_search"))).unwrap();
    assert_eq!(reply["result"]["isError"], false);
    assert_eq!(server.paths().len(), 1);
}
