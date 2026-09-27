use std::sync::Arc;
use std::time::{Duration, Instant};

use super::manager_tests::{shell, wait_for, TestSink};
use super::{FlushConfig, PtyManager};

#[test]
fn input_for_a_program_that_is_not_reading_does_not_block_the_caller() {
    let sink = Arc::new(TestSink::default());
    let manager = PtyManager::new(sink.clone(), FlushConfig::default());
    let info = manager
        .create_session("shell", "busy", &shell("exec sleep 30"))
        .unwrap();
    // Whole lines: the line discipline holds about a kilobyte of them for a
    // program that is not reading before a write to the master blocks.
    let paste = format!("{}\n", "x".repeat(63)).repeat(256);
    let started = Instant::now();
    for _ in 0..64 {
        manager.write_input(info.id, paste.as_bytes()).unwrap();
    }
    // A megabyte is far beyond that, so writing it inline would still be
    // blocked here until the program read it.
    assert!(started.elapsed() < Duration::from_secs(2));
    manager.remove(info.id).unwrap();
}

#[test]
fn shutdown_gives_every_session_one_shared_grace_period() {
    let sink = Arc::new(TestSink::default());
    let manager = PtyManager::new(sink.clone(), FlushConfig::default());
    let ids: Vec<_> = (0..4)
        .map(|_| {
            let spec = shell("trap '' HUP; printf ready; exec sleep 30");
            manager
                .create_session("shell", "stubborn", &spec)
                .unwrap()
                .id
        })
        .collect();
    assert!(wait_for(
        || {
            let output = sink.output.lock();
            ids.iter()
                .all(|id| output.get(id).is_some_and(|text| text.contains("ready")))
        },
        Duration::from_secs(5),
    ));
    let started = Instant::now();
    manager.shutdown();
    // Each of these ignores the hang-up, so one grace period apiece would
    // take at least 800 ms.
    assert!(started.elapsed() < Duration::from_millis(750));
    assert!(wait_for(
        || sink.exits.lock().len() == ids.len(),
        Duration::from_secs(5),
    ));
    // Everything has exited, so a second shutdown has nothing to wait for.
    let again = Instant::now();
    manager.shutdown();
    assert!(again.elapsed() < Duration::from_millis(100));
}
