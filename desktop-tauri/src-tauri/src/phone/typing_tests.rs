use super::{
    backend::DesktopBackend, control::TYPING_OFF, vault::Vault, workspace::SharedWorkspace,
};
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::Receiver,
        Arc,
    },
    time::{Duration, Instant},
};
use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
use vibyra_host::Backend;

struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}

fn wait_for(events: &Receiver<Value>, name: &str) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if events
            .recv_timeout(Duration::from_millis(250))
            .is_ok_and(|event| event["event"] == name)
        {
            return;
        }
    }
    panic!("no {name} event reached the phone");
}

#[cfg(unix)]
#[test]
fn a_phone_types_into_the_macs_own_terminal() {
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let script = "while read line; do printf 'GOT:%s\\n' \"$line\"; done";
    let spec = LaunchSpec {
        program: "/bin/sh".into(),
        args: vec!["-c".into(), script.into()],
        env: vec![],
        env_remove: vec![],
        cwd: None,
        rows: 30,
        cols: 100,
    };
    let pty = manager
        .create_session("shell", "Existing chat", &spec)
        .unwrap();
    let typing = Arc::new(AtomicBool::new(false));
    let backend = DesktopBackend::new(
        manager.clone(),
        SharedWorkspace::default(),
        typing.clone(),
        Vault::empty(),
        Default::default(),
    )
    .unwrap();
    let state = backend.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(state["capabilities"]["canInput"], false);
    assert_eq!(state["sessions"][0]["canInput"], false);
    assert_eq!(
        state["sessions"][0]["readOnly"], true,
        "still no stop or files"
    );
    let id = state["sessions"][0]["id"].as_str().unwrap().to_owned();
    let snapshot = backend
        .handle("phone", "session.snapshot", json!({"sessionId":id}))
        .unwrap();
    let claim = json!({"sessionId":id});
    let refused = backend.handle("phone", "session.claim", claim.clone());
    assert_eq!(
        refused,
        Err(TYPING_OFF.into()),
        "an off switch only lets it watch"
    );

    // Turning it on reaches a phone that is already connected.
    let events = backend.subscribe();
    wait_for(&events, "host.changed");
    typing.store(true, Ordering::SeqCst);
    wait_for(&events, "host.changed");
    let state = backend.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(state["capabilities"]["canInput"], true);
    assert_eq!(state["sessions"][0]["canInput"], true);

    let held = backend
        .handle("phone", "session.claim", claim.clone())
        .unwrap();
    assert_eq!(held["generation"], snapshot["generation"]);
    // A second trusted phone takes the terminal, and the first takes it back
    // the same way: the lease in a person's hand is never blocked by one on a
    // desk. Its own lease is what carries every key below.
    let taken = backend
        .handle("other-phone", "session.claim", claim.clone())
        .unwrap();
    assert_ne!(taken["lease"], held["lease"]);
    let held = backend.handle("phone", "session.claim", claim).unwrap();
    let input = json!({"sessionId":id,"lease":held["lease"],"generation":held["generation"],
        "inputId":"8d9f7c1e-0000-4000-8000-000000000001","data":"hello from the phone\r"});
    let mut stale = input.clone();
    stale["generation"] = json!("an-earlier-run");
    assert!(backend.handle("phone", "session.input", stale).is_err());
    assert!(backend
        .handle("other-phone", "session.input", input.clone())
        .is_err());
    let accepted = backend
        .handle("phone", "session.input", input.clone())
        .unwrap();
    assert_eq!(accepted["accepted"], true);
    backend
        .handle("phone", "session.input", input.clone())
        .unwrap();

    let typed = |needle: &str| {
        let (output, _, _) = manager.remote_snapshot(pty.id).unwrap();
        output.matches(needle).count()
    };
    let deadline = Instant::now() + Duration::from_secs(5);
    while typed("GOT:hello from the phone") == 0 {
        assert!(Instant::now() < deadline, "the Mac's terminal never ran it");
        std::thread::sleep(Duration::from_millis(20));
    }
    std::thread::sleep(Duration::from_millis(300));
    let once = typed("GOT:hello from the phone");
    assert_eq!(once, 1, "a retry is not typed twice");

    // Leaving hands the terminal back, so another phone can take it.
    backend.disconnected("phone");
    let other = backend.handle("other-phone", "session.claim", json!({"sessionId":id}));
    assert!(other.is_ok());
    manager.shutdown();
}

#[path = "typing_preferences_tests.rs"]
mod preferences;
