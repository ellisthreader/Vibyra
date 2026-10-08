//! A late delivered click may exhaust settling, but must still refresh later.
use super::focus::{Focused, TAP_WAIT};
use super::tests_fake::{capture, eventually, field};
use serde_json::{json, Value};
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
fn a_late_delivered_click_returns_cache_then_refreshes_its_actual_focus() {
    let (backend, capture) = capture();
    let before = eventually(&capture, |state| state["serial"].as_u64() > Some(0));
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
    capture.focus().unwrap();
    started_read.recv_timeout(Duration::from_secs(1)).unwrap();
    // The deadline starts at Capture::input entry, before fake delivery. After
    // this pause only the bounded 30 ms fresh-read allowance remains; focus
    // itself still moves at the original 60 ms after actual delivery.
    *backend.delivery_stall.lock() = TAP_WAIT + Duration::from_millis(20);
    let started = Instant::now();
    let reply = capture
        .input(&json!({"kind":"click","x":0.2,"y":0.2}))
        .unwrap();
    let elapsed = started.elapsed();
    assert!(elapsed < Duration::from_millis(400), "{elapsed:?}");
    assert_eq!(reply["serial"], before["serial"], "{reply}");
    assert_eq!(reply["editable"], false, "{reply}");
    assert_changed_or_expired(&reply, &before, elapsed);
    drop(release);
    let observed = eventually(&capture, |state| state["editable"] == true);
    capture.stop();
    assert_eq!(observed["kind"], "secure", "{observed}");
    assert!(observed["serial"].as_u64() > before["serial"].as_u64());
    assert_eq!(backend.inputs.lock().len(), 1);
    assert_eq!(
        backend.max_reads.load(std::sync::atomic::Ordering::SeqCst),
        1
    );
}
