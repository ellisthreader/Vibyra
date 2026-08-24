use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use crate::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager, SessionId};

#[derive(Default)]
struct CollectingSink {
    output: Mutex<HashMap<SessionId, String>>,
}

impl OutputSink for CollectingSink {
    fn on_output(&self, id: SessionId, data: String) {
        self.output.lock().entry(id).or_default().push_str(&data);
    }

    fn on_resync(&self, id: SessionId, snapshot: String) {
        self.output.lock().insert(id, snapshot);
    }

    fn on_exit(&self, _id: SessionId, _code: Option<i32>) {}
}

fn spec(program: &str, args: &[&str]) -> LaunchSpec {
    LaunchSpec {
        program: program.into(),
        args: args.iter().map(|arg| (*arg).to_string()).collect(),
        env: vec![],
        env_remove: vec![],
        cwd: None,
        rows: 24,
        cols: 80,
    }
}

fn wait_for(mut condition: impl FnMut() -> bool, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if condition() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    false
}

/// Every keystroke is its own `write_input` call, so the write path — not just
/// a single buffered chunk — is what has to preserve order.
///
/// Terminal echo is switched off first: Linux drops echoes when the line
/// discipline's echo buffer overflows during a burst, which would make the
/// combined stream nondeterministic without saying anything about this code.
/// What is left is purely what `cat` read back, in the order it read it.
#[test]
fn separate_writes_reach_the_pty_in_order() {
    const KEYS: usize = 200;
    let sink = Arc::new(CollectingSink::default());
    let manager = PtyManager::new(sink.clone(), FlushConfig::default());
    let info = manager
        .create_session(
            "shell",
            "cat",
            &spec("/bin/sh", &["-c", "stty -echo; printf READY; exec cat"]),
        )
        .unwrap();

    let seen = |needle: &str| {
        let needle = needle.to_string();
        wait_for(
            || {
                sink.output
                    .lock()
                    .get(&info.id)
                    .is_some_and(|text| text.contains(&needle))
            },
            Duration::from_secs(10),
        )
    };
    assert!(seen("READY"), "the child never disabled echo");

    for index in 0..KEYS {
        manager
            .write_input(info.id, format!("<{index}>\n").as_bytes())
            .unwrap();
    }
    assert!(
        seen(&format!("<{}>", KEYS - 1)),
        "the PTY never echoed the final write back",
    );

    let echoed = sink
        .output
        .lock()
        .get(&info.id)
        .cloned()
        .unwrap_or_default();
    let mut previous = 0;
    for index in 0..KEYS {
        let marker = format!("<{index}>");
        let at = echoed
            .find(&marker)
            .unwrap_or_else(|| panic!("{marker} never reached the PTY"));
        assert!(at >= previous, "{marker} arrived before an earlier write");
        previous = at;
    }
    manager.remove(info.id).unwrap();
}

/// The write command runs inline on the thread that dispatches every IPC
/// message. If it blocked on a child that has stopped reading its stdin, the
/// whole UI would stall — so queueing must return regardless of the child.
#[test]
fn writing_to_a_child_that_never_reads_does_not_block() {
    let sink = Arc::new(CollectingSink::default());
    let manager = PtyManager::new(sink, FlushConfig::default());
    let info = manager
        .create_session("shell", "sleep", &spec("/bin/sh", &["-c", "sleep 30"]))
        .unwrap();

    // Far more than the kernel's PTY buffer, which a blocking write would fill
    // within the first few chunks and then wait on until the child exits.
    let chunk = vec![b'x'; 16 * 1024];
    let started = Instant::now();
    for _ in 0..64 {
        manager.write_input(info.id, &chunk).unwrap();
    }
    let elapsed = started.elapsed();

    manager.remove(info.id).unwrap();
    assert!(
        elapsed < Duration::from_secs(2),
        "queueing 1 MiB blocked for {elapsed:?} — the IPC thread would have been stalled",
    );
}
