//! What the pacing costs the pane being typed into.
//!
//! Separate from `flusher_tests`, which asserts delivery *rates*. The bug this
//! file exists for had the rates entirely right and the latency wrong, so the
//! two are measured with different instruments and kept apart.

use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use super::{FlushConfig, LaunchSpec, OutputSink, PtyManager, SessionId, Visibility};

/// Records *when* each session was delivered to, which is what the pacing
/// bug showed up as: the delivery *rate* was right, the focused pane's echo
/// was late.
#[derive(Default)]
struct StampingSink {
    seen: Mutex<Vec<(SessionId, Instant)>>,
}

impl StampingSink {
    /// The first delivery to `id` at or after `after`, waited for up to
    /// `timeout`.
    fn first_after(&self, id: SessionId, after: Instant, timeout: Duration) -> Option<Instant> {
        let deadline = Instant::now() + timeout;
        loop {
            let found = self
                .seen
                .lock()
                .iter()
                .find(|(seen, at)| *seen == id && *at >= after)
                .map(|(_, at)| *at);
            if found.is_some() {
                return found;
            }
            if Instant::now() >= deadline {
                return None;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
    }
}

impl OutputSink for StampingSink {
    fn on_output(&self, id: SessionId, _data: String) {
        self.seen.lock().push((id, Instant::now()));
    }
    fn on_resync(&self, id: SessionId, _snapshot: String) {
        self.seen.lock().push((id, Instant::now()));
    }
    fn on_exit(&self, _id: SessionId, _code: Option<i32>) {}
}

/// Streams for long enough to outlast the sampling loop below.
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

/// A shell that says nothing until it is typed into, so the only output this
/// measures is the tty echo of its own keystroke.
fn quiet_shell() -> LaunchSpec {
    LaunchSpec::shell(Some("/bin/sh".into()), None)
}

#[test]
fn a_streaming_background_pane_does_not_delay_the_focused_echo() {
    // Exaggerated intervals make the regression unmistakable. The old flusher
    // slept one whole `tick` after *any* session delivered, so a background
    // pane streaming tokens owned the only delivery slot and the focused
    // pane's echo waited that sleep out behind it — the "typing one character
    // behind" report. Per-session pacing means a focused pane that has been
    // quiet longer than its own interval is due the moment its bytes exist.
    const TICK: Duration = Duration::from_millis(120);
    // Deliberately not a multiple of TICK: each keystroke then lands at a
    // different phase of the old global sleep, so the sampling below cannot
    // pass by luck the way a single keystroke could.
    const GAP: Duration = Duration::from_millis(170);
    const SAMPLES: usize = 6;

    let config = FlushConfig {
        tick: TICK,
        background_interval: Duration::from_millis(15),
        ..FlushConfig::default()
    };
    let sink = Arc::new(StampingSink::default());
    let manager = PtyManager::new(sink.clone(), config);

    let noisy = manager
        .create_session("shell", "noisy", &streaming())
        .unwrap();
    manager
        .set_visibility(noisy.id, Visibility::Background)
        .unwrap();
    let focused = manager
        .create_session("shell", "focused", &quiet_shell())
        .unwrap();
    manager
        .set_visibility(focused.id, Visibility::Visible)
        .unwrap();

    // Let the shell print its prompt and the background stream get going, so
    // the focused pane is genuinely idle when the first keystroke lands.
    std::thread::sleep(Duration::from_millis(250));

    let mut worst = Duration::ZERO;
    for _ in 0..SAMPLES {
        let typed = Instant::now();
        manager.write_input(focused.id, b"x").unwrap();
        let echoed = sink
            .first_after(focused.id, typed, Duration::from_secs(1))
            .expect("focused pane never echoed its keystroke");
        worst = worst.max(echoed - typed);
        // Longer than TICK, so the focused pane is owed its own delivery every
        // time and the only thing that can delay it is another pane's pacing.
        std::thread::sleep(GAP);
    }

    assert!(
        worst < Duration::from_millis(50),
        "worst focused echo was {worst:?} while a background pane streamed; \
         it is waiting on another pane's pacing, not its own",
    );

    let _ = manager.remove(noisy.id);
    let _ = manager.remove(focused.id);
}
