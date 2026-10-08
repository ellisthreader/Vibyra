#![cfg(unix)]
mod support;
use serde_json::json;
use support::{wait, Harness};

#[test]
fn stopping_busy_shell_interrupts_its_foreground_command() {
    let host = Harness::new();
    let session = host.create();
    let lease = host.claim(&session);
    host.engine
        .handle(
            "phone-a",
            "session.input",
            host.input(
                &session,
                &lease,
                "printf started > started; sleep 3; printf not-stopped > unexpected\n",
            ),
        )
        .unwrap();
    wait(|| host.path.join("started").exists());
    host.engine
        .handle(
            "phone-a",
            "session.stop",
            json!({"sessionId":session["id"]}),
        )
        .unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);
    while std::time::Instant::now() < deadline && host.snapshot(&session)["status"] == "running" {
        std::thread::sleep(std::time::Duration::from_millis(15));
    }
    assert_eq!(host.snapshot(&session)["status"], "exited");
    assert!(!host.path.join("unexpected").exists());
}
