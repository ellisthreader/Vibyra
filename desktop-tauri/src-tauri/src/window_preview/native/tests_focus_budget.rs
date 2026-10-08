//! A late delivered click may exhaust settling, but must still refresh later.
use super::backend::Backend;
use super::focus::{Focused, Tracker, TAP_WAIT};
use super::input::InputEvent;
use super::tests_fake::{capture, field};
use serde_json::Value;
use std::sync::mpsc::{channel, Sender};
use std::time::{Duration, Instant};

pub(super) fn assert_changed_or_expired(reply: &Value, before: &Value, elapsed: Duration) {
    if reply["serial"].as_u64() > before["serial"].as_u64() || elapsed < TAP_WAIT {
        assert_eq!(reply["editable"], true, "elapsed={elapsed:?}: {reply}");
        assert_eq!(reply["kind"], "secure");
        assert!(reply["serial"].as_u64() > before["serial"].as_u64());
    } else {
        // Bounded settling may return its cache; never a fabricated new focus.
        for key in ["serial", "editable", "front", "kind"] {
            assert_eq!(reply[key], before[key], "elapsed={elapsed:?}: {reply}");
        }
        assert_eq!(reply["editable"], false);
    }
}

struct ReleaseReader(Option<Sender<()>>);
impl Drop for ReleaseReader {
    fn drop(&mut self) {
        if let Some(release) = self.0.take() {
            let _ = release.send(());
        }
    }
}

#[test]
fn an_expired_tap_budget_returns_cache_then_refreshes_its_actual_focus() {
    let (backend, capture) = capture();
    let tracker = Tracker::default();
    let window = backend.info(3).unwrap();
    let before = tracker.measure(backend, &window, Instant::now() + Duration::from_secs(3));
    assert!(before["serial"].as_u64() > Some(0), "{before}");
    *backend.click_focuses.lock() = Some(Focused {
        front: true,
        identity: "pass".into(),
        field: Some(field("secure", [150.0, 160.0, 300.0, 30.0])),
    });
    let (reading, started_read) = channel();
    let (release, wait) = channel();
    let release = ReleaseReader(Some(release));
    *backend.focus_gate.lock() = Some((reading, wait));
    // Block the one reader before input; no late scheduled publication can
    // replace the exact cached response this expiry fixture is exercising.
    tracker.current(backend, &window);
    started_read.recv_timeout(Duration::from_secs(1)).unwrap();
    backend
        .input(
            &window,
            &InputEvent::Click {
                x: 0.2,
                y: 0.2,
                right: false,
            },
        )
        .unwrap();
    // Model the already exhausted request deadline directly, instead of making
    // the host sleep to advance time. Real fake delivery still takes 60 ms to
    // move focus. Existing Capture::input tests cover its whole-call budget.
    let expired = Instant::now() - TAP_WAIT;
    let started = Instant::now();
    let reply = tracker.settled(
        backend,
        &window,
        before["serial"].as_u64().unwrap(),
        expired,
        std::thread::sleep,
    );
    let elapsed = started.elapsed();
    assert!(elapsed < Duration::from_millis(400), "{elapsed:?}");
    assert_eq!(reply["serial"], before["serial"], "{reply}");
    assert_eq!(reply["editable"], false, "{reply}");
    for key in ["serial", "editable", "front", "kind"] {
        assert_eq!(reply[key], before[key], "{reply}");
    }
    drop(release);
    let deadline = Instant::now() + Duration::from_secs(3);
    let observed = loop {
        let state = tracker.current(backend, &window);
        if state["editable"] == true {
            break state;
        }
        assert!(Instant::now() < deadline, "focus never refreshed: {state}");
        std::thread::sleep(Duration::from_millis(15));
    };
    capture.stop();
    assert_eq!(observed["kind"], "secure", "{observed}");
    assert!(observed["serial"].as_u64() > before["serial"].as_u64());
    assert_eq!(backend.inputs.lock().len(), 1);
    assert_eq!(
        backend.max_reads.load(std::sync::atomic::Ordering::SeqCst),
        1
    );
}
