use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use super::{FlushConfig, LaunchSpec, OutputSink, PtyManager, SessionId, Visibility};

/// Counts deliveries rather than bytes. The renderer pays per *message* — one
/// xterm write plus a canvas repaint each — so the delivery count is the thing
/// the pacing has to bound, and the thing this asserts.
#[derive(Default)]
struct CountingSink {
    deliveries: AtomicUsize,
}

impl OutputSink for CountingSink {
    fn on_output(&self, _id: SessionId, _data: String) {
        self.deliveries.fetch_add(1, Ordering::SeqCst);
    }
    fn on_resync(&self, _id: SessionId, _snapshot: String) {}
    fn on_exit(&self, _id: SessionId, _code: Option<i32>) {}
}

fn chatty() -> LaunchSpec {
    LaunchSpec {
        program: "/bin/sh".into(),
        // Emits continuously so the flusher always has something pending;
        // what differs between the tiers is purely how often it may deliver.
        args: vec![
            "-c".into(),
            "i=0; while [ $i -lt 400 ]; do printf 'x'; i=$((i+1)); sleep 0.005; done".into(),
        ],
        env: vec![],
        env_remove: vec![],
        cwd: None,
        rows: 24,
        cols: 80,
    }
}

fn paced_config() -> FlushConfig {
    FlushConfig {
        tick: Duration::from_millis(5),
        background_interval: Duration::from_millis(100),
        ..FlushConfig::default()
    }
}

fn deliveries_over(visibility: Visibility, window: Duration) -> usize {
    let sink = Arc::new(CountingSink::default());
    let manager = PtyManager::new(sink.clone(), paced_config());
    let info = manager.create_session("shell", "test", &chatty()).unwrap();
    manager.set_visibility(info.id, visibility).unwrap();
    // Ignore the burst the visibility change itself wakes, so the count
    // reflects the steady-state rate rather than the transition.
    std::thread::sleep(Duration::from_millis(50));
    sink.deliveries.store(0, Ordering::SeqCst);
    std::thread::sleep(window);
    let count = sink.deliveries.load(Ordering::SeqCst);
    let _ = manager.remove(info.id);
    count
}

#[test]
fn background_panes_deliver_far_less_often_than_the_focused_one() {
    let window = Duration::from_millis(600);
    let background = deliveries_over(Visibility::Background, window);
    let focused = deliveries_over(Visibility::Visible, window);

    // 600 ms at a 100 ms interval is ~6 deliveries; the bound is loose because
    // CI timing is not a metronome. The point is the order of magnitude.
    assert!(
        background <= 12,
        "background pane delivered {background} times in {window:?}; pacing is not applied",
    );
    // The focused pane must keep its rate — throttling the pane being typed
    // into is the regression this whole change exists to avoid.
    assert!(
        focused > background,
        "focused pane delivered {focused} times vs background {background}; \
         focus must keep the full tick",
    );
}

#[test]
fn focusing_a_background_pane_flushes_it_immediately() {
    let sink = Arc::new(CountingSink::default());
    let manager = PtyManager::new(sink.clone(), paced_config());
    let info = manager.create_session("shell", "test", &chatty()).unwrap();
    manager
        .set_visibility(info.id, Visibility::Background)
        .unwrap();
    std::thread::sleep(Duration::from_millis(150));
    sink.deliveries.store(0, Ordering::SeqCst);

    // Taking focus must not wait out the background interval: set_visibility
    // wakes the flusher, so the echo of the first keystroke is not delayed.
    manager
        .set_visibility(info.id, Visibility::Visible)
        .unwrap();
    std::thread::sleep(Duration::from_millis(40));
    assert!(
        sink.deliveries.load(Ordering::SeqCst) > 0,
        "focusing a paced pane left it waiting for the background interval",
    );
    let _ = manager.remove(info.id);
}
