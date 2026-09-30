//! A delivered tap must not reply with an older cached focus observation.
use super::backend::Backend;
use super::focus::{Focused, Tracker};
use super::tests_fake::{capture, eventually, field};
use serde_json::json;
use std::time::{Duration, Instant};

fn typing() -> Focused {
    Focused {
        front: true,
        identity: "pass".into(),
        field: Some(field("secure", [150.0, 160.0, 300.0, 30.0])),
    }
}

#[test]
fn a_slow_delivered_tap_observes_focus_after_injection() {
    let (backend, capture) = capture();
    let before = eventually(&capture, |state| state["serial"].as_u64() > Some(0));
    *backend.click_focuses.lock() = Some(typing());
    // Focus moves 60 ms after delivery, while injection waits before returning.
    *backend.input_stall.lock() = Duration::from_millis(240);
    let started = Instant::now();
    let reply = capture
        .input(&json!({"kind":"click","x":0.2,"y":0.2}))
        .unwrap();
    let elapsed = started.elapsed();
    capture.stop();
    assert_eq!(reply["editable"], true, "{reply}");
    assert_eq!(reply["kind"], "secure");
    assert!(reply["serial"].as_u64() > before["serial"].as_u64());
    assert_eq!(backend.inputs.lock().len(), 1);
    assert!(elapsed < Duration::from_millis(400), "{elapsed:?}");
}

#[test]
fn a_late_poll_wake_returns_the_newest_background_observation() {
    let (backend, capture) = capture();
    let tracker = Tracker::default();
    let window = backend.info(3).unwrap();
    let before = tracker.measure(backend, &window)["serial"]
        .as_u64()
        .unwrap();
    let deadline = Instant::now() + Duration::from_millis(60);
    let started = Instant::now();
    let reply = tracker.settled(backend, &window, before, deadline, |_| {
        *backend.focused.lock() = typing();
        // Model the reader completing during a delayed scheduling wake.
        assert_eq!(tracker.measure(backend, &window)["editable"], true);
        std::thread::sleep(deadline.saturating_duration_since(Instant::now()));
        // A new read after this late wake would wait on a hung application.
        *backend.stall.lock() = Duration::from_millis(1500);
    });
    *backend.stall.lock() = Duration::ZERO;
    capture.stop();
    assert_eq!(reply["editable"], true, "{reply}");
    assert_eq!(reply["kind"], "secure");
    assert!(reply["serial"].as_u64().unwrap() > before);
    assert!(started.elapsed() < Duration::from_millis(400));
}
