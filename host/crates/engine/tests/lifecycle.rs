#![cfg(unix)]
mod support;
use serde_json::json;
use support::{wait, Harness};

#[test]
fn disconnect_keeps_real_process_alive_and_reconnect_recovers_output() {
    let host = Harness::new();
    let events = host.engine.subscribe();
    let session = host.create();
    let lease = host.claim(&session);
    let input = host.input(&session, &lease, "sleep 0.15; printf survived > alive\n");
    host.engine
        .handle("phone-a", "session.input", input)
        .unwrap();
    host.engine.disconnected("phone-a");
    wait(|| host.path.join("alive").exists());
    assert_eq!(
        std::fs::read_to_string(host.path.join("alive")).unwrap(),
        "survived"
    );
    assert_eq!(host.snapshot(&session)["status"], "running");
    let next = host
        .engine
        .handle(
            "phone-b",
            "session.claim",
            json!({"sessionId":session["id"]}),
        )
        .unwrap();
    assert_ne!(next["lease"], lease["lease"]);
    assert!(events
        .try_iter()
        .any(|event| event["event"] == "terminal.output"));
}

#[test]
fn duplicate_input_is_applied_once_and_conflicting_reuse_rejected() {
    let host = Harness::new();
    let session = host.create();
    let lease = host.claim(&session);
    let mut input = host.input(&session, &lease, "printf x >> once\n");
    host.engine
        .handle("phone-a", "session.input", input.clone())
        .unwrap();
    host.engine
        .handle("phone-a", "session.input", input.clone())
        .unwrap();
    wait(|| host.path.join("once").exists());
    std::thread::sleep(std::time::Duration::from_millis(120));
    assert_eq!(
        std::fs::read_to_string(host.path.join("once")).unwrap(),
        "x"
    );
    input["data"] = json!("printf y >> once\n");
    assert!(host
        .engine
        .handle("phone-a", "session.input", input)
        .is_err());
}

#[test]
fn controller_lease_fences_other_devices_old_tokens_and_dimensions() {
    let host = Harness::new();
    let session = host.create();
    let lease = host.claim(&session);
    let params = json!({"sessionId":session["id"]});
    assert!(host
        .engine
        .handle("phone-b", "session.claim", params.clone())
        .is_err());
    let input = host.input(&session, &lease, "printf unauthorized\n");
    assert!(host
        .engine
        .handle("phone-b", "session.input", input.clone())
        .is_err());
    let mut resize = input.clone();
    resize["cols"] = json!(100);
    resize["rows"] = json!(30);
    assert!(host
        .engine
        .handle("phone-b", "session.resize", resize.clone())
        .is_err());
    host.engine
        .handle("phone-a", "session.resize", resize.clone())
        .unwrap();
    resize["cols"] = json!(0);
    assert!(host
        .engine
        .handle("phone-a", "session.resize", resize)
        .is_err());
    host.engine.disconnected("phone-a");
    host.engine
        .handle("phone-b", "session.claim", params)
        .unwrap();
    assert!(host
        .engine
        .handle("phone-a", "session.input", input)
        .is_err());
}

#[test]
fn terminal_exit_preserves_last_output_and_reports_real_exit_code() {
    let host = Harness::new();
    let events = host.engine.subscribe();
    let session = host.create();
    let lease = host.claim(&session);
    host.engine
        .handle(
            "phone-a",
            "session.input",
            host.input(&session, &lease, "printf 'final-🦀'; exit 7\n"),
        )
        .unwrap();
    wait(|| host.snapshot(&session)["status"] == "exited");
    let snapshot = host.snapshot(&session);
    assert!(snapshot["output"].as_str().unwrap().contains("final-🦀"));
    let received: Vec<_> = events.try_iter().collect();
    let exit = received
        .iter()
        .find(|event| event["event"] == "terminal.exit")
        .unwrap();
    assert_eq!(exit["data"]["exitCode"], 7);
    let output: String = received
        .iter()
        .filter(|event| event["event"] == "terminal.output")
        .map(|event| event["data"]["output"].as_str().unwrap())
        .collect();
    assert_eq!(snapshot["offset"].as_u64().unwrap(), output.len() as u64);
}

#[test]
fn explicit_stop_terminates_shell_and_remains_idempotent() {
    let host = Harness::new();
    let session = host.create();
    let params = json!({"sessionId":session["id"]});
    assert!(host
        .engine
        .handle("phone-b", "session.stop", params.clone())
        .is_err());
    host.engine
        .handle("phone-a", "session.stop", params.clone())
        .unwrap();
    wait(|| host.snapshot(&session)["status"] == "exited");
    host.engine
        .handle("phone-a", "session.stop", params)
        .unwrap();
}
