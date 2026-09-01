//! The renderer-paced rule: one unpainted chunk per session.
//!
//! `flusher_tests` and `flusher_latency_tests` model a renderer that paints
//! instantly and never says so — which is exactly how an older frontend
//! behaves, and why they still hold. This file models the shipped frontend: it
//! reports every paint, and the flusher holds the next chunk until it does.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Weak};
use std::time::Duration;

use parking_lot::Mutex;

use super::{FlushConfig, LaunchSpec, OutputSink, PtyManager, SessionId, Visibility};

/// Counts deliveries and, while `reporting`, tells the manager each one was
/// painted — the webview's `terminal_painted` call, minus the frame it waits.
#[derive(Default)]
struct PaintingSink {
    deliveries: AtomicUsize,
    reporting: AtomicBool,
    manager: Mutex<Weak<PtyManager>>,
}

impl PaintingSink {
    fn deliver(&self, id: SessionId) {
        self.deliveries.fetch_add(1, Ordering::SeqCst);
        if !self.reporting.load(Ordering::SeqCst) {
            return;
        }
        if let Some(manager) = self.manager.lock().upgrade() {
            let _ = manager.painted(id);
        }
    }

    fn deliveries_over(&self, window: Duration) -> usize {
        self.deliveries.store(0, Ordering::SeqCst);
        std::thread::sleep(window);
        self.deliveries.load(Ordering::SeqCst)
    }
}

impl OutputSink for PaintingSink {
    fn on_output(&self, id: SessionId, _data: String) {
        self.deliver(id);
    }
    fn on_resync(&self, id: SessionId, _snapshot: String) {
        self.deliver(id);
    }
    fn on_exit(&self, _id: SessionId, _code: Option<i32>) {}
}

/// Streams for longer than any test below runs.
fn streaming() -> LaunchSpec {
    LaunchSpec {
        program: "/bin/sh".into(),
        args: vec![
            "-c".into(),
            "while true; do printf 'x'; sleep 0.005; done".into(),
        ],
        env: vec![],
        env_remove: vec![],
        cwd: None,
        rows: 24,
        cols: 80,
    }
}

const PAINT_TIMEOUT: Duration = Duration::from_millis(300);

/// A focused pane whose renderer has already reported once, so the gate is
/// armed; `reporting` says whether it keeps reporting from here on.
fn armed_focused_pane() -> (Arc<PaintingSink>, Arc<PtyManager>, SessionId) {
    let sink = Arc::new(PaintingSink::default());
    sink.reporting.store(true, Ordering::SeqCst);
    let config = FlushConfig {
        tick: Duration::from_millis(5),
        paint_timeout: PAINT_TIMEOUT,
        ..FlushConfig::default()
    };
    let manager = PtyManager::new(sink.clone(), config);
    *sink.manager.lock() = Arc::downgrade(&manager);
    let info = manager
        .create_session("shell", "test", &streaming())
        .unwrap();
    manager
        .set_visibility(info.id, Visibility::Visible)
        .unwrap();
    std::thread::sleep(Duration::from_millis(100));
    (sink, manager, info.id)
}

#[test]
fn a_renderer_that_keeps_up_is_not_slowed_by_reporting() {
    let (sink, manager, id) = armed_focused_pane();
    let deliveries = sink.deliveries_over(Duration::from_millis(600));
    let _ = manager.remove(id);
    // Instant reports leave the 5 ms tick as the only limit: ~120 possible,
    // and far more than the ≤4 an unpainted session is held to below.
    assert!(
        deliveries >= 20,
        "an instantly painting renderer was throttled to {deliveries} deliveries in 600 ms",
    );
}

#[test]
fn an_unpainted_chunk_holds_the_next_until_the_timeout_and_no_longer() {
    let (sink, manager, id) = armed_focused_pane();
    // The renderer goes quiet — a hidden window, a stalled frame loop.
    sink.reporting.store(false, Ordering::SeqCst);
    let deliveries = sink.deliveries_over(Duration::from_millis(700));
    let _ = manager.remove(id);
    // At most the chunk in flight plus one per elapsed timeout; without the
    // gate this window holds ~140.
    assert!(
        deliveries <= 4,
        "{deliveries} deliveries in 700 ms to a pane that never reported a paint",
    );
    // And never a stall: the timeout keeps output moving to a renderer that
    // cannot, or will not, report.
    assert!(
        deliveries >= 2,
        "only {deliveries} deliveries in 700 ms; the paint timeout did not release the hold",
    );
}

#[test]
fn a_paint_report_releases_the_held_chunk_at_once() {
    let (sink, manager, id) = armed_focused_pane();
    sink.reporting.store(false, Ordering::SeqCst);
    // Long enough for one unpainted delivery to go out and bytes to pile up
    // behind it, well short of the timeout that would release it anyway.
    std::thread::sleep(Duration::from_millis(120));
    sink.deliveries.store(0, Ordering::SeqCst);

    manager.painted(id).unwrap();
    std::thread::sleep(Duration::from_millis(40));
    let released = sink.deliveries.load(Ordering::SeqCst);
    let _ = manager.remove(id);
    assert!(
        released >= 1,
        "the paint report did not wake the flusher; the pane waited for the timeout instead",
    );
}

#[test]
fn reporting_a_paint_for_an_unknown_session_is_an_error_not_a_panic() {
    let sink = Arc::new(PaintingSink::default());
    let manager = PtyManager::new(sink, FlushConfig::default());
    assert!(manager.painted(4242).is_err());
}
