//! Pacing may change *when* output reaches the renderer, never *what*.
//!
//! Separate from `flusher_tests`, which asserts delivery rates: the guarantee
//! here is completeness under the slowest tier the app ships.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use super::{FlushConfig, LaunchSpec, OutputSink, PtyManager, SessionId, Visibility};

/// Keeps every delivered chunk so the *content* can be checked, not just the
/// rate.
#[derive(Default)]
struct CollectingSink {
    chunks: parking_lot::Mutex<String>,
    deliveries: AtomicUsize,
}

impl OutputSink for CollectingSink {
    fn on_output(&self, _id: SessionId, data: String) {
        self.chunks.lock().push_str(&data);
        self.deliveries.fetch_add(1, Ordering::SeqCst);
    }
    // A resync replaces the incremental stream, so treating it as an append
    // would let an overflow masquerade as intact output.
    fn on_resync(&self, _id: SessionId, snapshot: String) {
        *self.chunks.lock() = snapshot;
        self.deliveries.fetch_add(1, Ordering::SeqCst);
    }
    fn on_exit(&self, _id: SessionId, _code: Option<i32>) {}
}

/// 1000 `x` in 200 small writes: enough writes that a 250 ms interval must
/// coalesce many of them, few enough bytes that `pending_cap` is never near.
fn emits_1000_x() -> LaunchSpec {
    LaunchSpec {
        program: "/bin/sh".into(),
        args: vec![
            "-c".into(),
            "i=0; while [ $i -lt 200 ]; do printf 'xxxxx'; i=$((i+1)); sleep 0.002; done".into(),
        ],
        env: vec![],
        env_remove: vec![],
        cwd: None,
        rows: 24,
        cols: 80,
    }
}

#[test]
fn slow_pacing_coalesces_output_without_losing_any_of_it() {
    let sink = Arc::new(CollectingSink::default());
    let config = FlushConfig {
        // The shared-memory pacing from `flush_pacing::flush_config`.
        background_interval: Duration::from_millis(250),
        ..FlushConfig::default()
    };
    let manager = PtyManager::new(sink.clone(), config);
    let info = manager
        .create_session("shell", "test", &emits_1000_x())
        .unwrap();
    manager
        .set_visibility(info.id, Visibility::Background)
        .unwrap();

    // Wait for the stream to settle rather than for a fixed time: the assertion
    // is about completeness, and a timing guess would make it flaky instead.
    let mut stable_for = Duration::ZERO;
    let mut seen = 0usize;
    let step = Duration::from_millis(100);
    while stable_for < Duration::from_millis(800) {
        std::thread::sleep(step);
        let now = sink.chunks.lock().len();
        stable_for = if now == seen {
            stable_for + step
        } else {
            Duration::ZERO
        };
        seen = now;
    }

    let delivered = sink.chunks.lock().matches('x').count();
    let deliveries = sink.deliveries.load(Ordering::SeqCst);
    let _ = manager.remove(info.id);

    assert_eq!(
        delivered, 1000,
        "pacing dropped output: {delivered} of 1000 characters arrived in {deliveries} deliveries",
    );
    // The whole point of pacing: far fewer repaints than writes. Without
    // coalescing this would be ~200, and the renderer would pay for each one.
    assert!(
        deliveries < 60,
        "expected the 200 writes to coalesce, but the renderer was handed {deliveries} of them",
    );
}
