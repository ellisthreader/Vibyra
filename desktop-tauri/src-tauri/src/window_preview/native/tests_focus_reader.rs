//! Slow application reads stay on one reader, never on the tap caller.
use super::backend::Backend;
use super::focus::{Focused, Tracker};
use super::tests_fake::{capture, eventually, field};
use serde_json::json;
use std::sync::atomic::Ordering;
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};

#[test]
fn a_hung_focus_read_cannot_block_a_tap_or_frames() {
    let (backend, capture) = capture();
    *backend.stall.lock() = Duration::from_millis(1500);
    let started = Instant::now();
    let reply = capture
        .input(&json!({"kind":"click","x":0.9,"y":0.9}))
        .unwrap();
    let elapsed = started.elapsed();
    assert_eq!(reply["editable"], false);
    assert!(elapsed < Duration::from_millis(400), "{elapsed:?}");
    assert!(capture.frame().is_ok());
    assert_eq!(backend.inputs.lock().len(), 1);
    assert_eq!(backend.max_reads.load(Ordering::SeqCst), 1);
    capture.stop();
}

#[test]
fn a_hung_field_scan_cannot_block_a_tap_or_accept_an_older_reply() {
    let (backend, capture) = capture();
    *backend.fields_stall.lock() = Duration::from_millis(1500);
    let before = eventually(&capture, |state| {
        backend.fields_started.load(Ordering::SeqCst) && state["serial"].as_u64() > Some(0)
    });
    *backend.click_focuses.lock() = Some(Focused {
        front: true,
        identity: "new".into(),
        field: Some(field("secure", [150.0, 160.0, 300.0, 30.0])),
    });
    let started = Instant::now();
    let reply = capture
        .input(&json!({"kind":"click","x":0.2,"y":0.2}))
        .unwrap();
    let elapsed = started.elapsed();
    assert!(elapsed < Duration::from_millis(400), "{elapsed:?}");
    // No post-input reply is available while the older field scan is hung.
    assert_eq!(reply["serial"], before["serial"]);
    assert_eq!(reply["editable"], false);
    assert!(capture.frame().is_ok());
    assert_eq!(backend.max_reads.load(Ordering::SeqCst), 1);
    capture.stop();
}

#[test]
fn fresh_observation_replies_before_its_field_map_scan() {
    let (backend, capture) = capture();
    *backend.fields_stall.lock() = Duration::from_millis(1500);
    *backend.focused.lock() = Focused {
        front: true,
        identity: "new".into(),
        field: Some(field("secure", [150.0, 160.0, 300.0, 30.0])),
    };
    let tracker = Tracker::default();
    let window = backend.info(3).unwrap();
    let started = Instant::now();
    let reply = tracker.measure(backend, &window, started + Duration::from_millis(100));
    assert_eq!(reply["editable"], true);
    assert!(started.elapsed() < Duration::from_millis(400));
    assert!(!backend.fields_started.load(Ordering::SeqCst));
    assert_eq!(backend.max_reads.load(Ordering::SeqCst), 1);
    capture.stop();
}

#[test]
fn an_inflight_pre_input_snapshot_cannot_satisfy_the_fresh_reply() {
    let (backend, capture) = capture();
    let (started, reading) = channel();
    let (release, wait) = channel();
    *backend.focus_gate.lock() = Some((started, wait));
    capture.focus().unwrap();
    reading.recv_timeout(Duration::from_secs(1)).unwrap();
    *backend.click_focuses.lock() = Some(Focused {
        front: true,
        identity: "new".into(),
        field: Some(field("secure", [150.0, 160.0, 300.0, 30.0])),
    });
    let tapped = capture.clone();
    let began = Instant::now();
    let thread = std::thread::spawn(move || {
        tapped
            .input(&json!({"kind":"click","x":0.2,"y":0.2}))
            .unwrap()
    });
    let due = Instant::now() + Duration::from_secs(1);
    while backend.inputs.lock().is_empty() && Instant::now() < due {
        std::thread::sleep(Duration::from_millis(1));
    }
    assert_eq!(backend.inputs.lock().len(), 1);
    // Keep the existing60ms native-focus delay. Then release the old snapshot.
    std::thread::sleep(Duration::from_millis(70));
    release.send(()).unwrap();
    let reply = thread.join().unwrap();
    let elapsed = began.elapsed();
    capture.stop();
    assert_eq!(reply["editable"], true, "{reply}");
    assert_eq!(reply["kind"], "secure");
    assert!(elapsed < Duration::from_millis(400), "{elapsed:?}");
    assert_eq!(backend.max_reads.load(Ordering::SeqCst), 1);
}
