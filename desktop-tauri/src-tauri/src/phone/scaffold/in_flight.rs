//! Builds a phone started that are still running, for quitting.
//!
//! Tauri ends the process with `exit`, so nothing is dropped: a package
//! manager a build started leads a process group that outlived the app. The
//! builds live inside whichever phone listener started them, so the process
//! keeps one list of their cancel switches for quitting to reach.

use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

static RUNNING: Mutex<Vec<Arc<AtomicBool>>> = Mutex::new(Vec::new());

/// Listed while it lives; held by a build's thread for as long as it runs.
pub(super) struct Tracked(Arc<AtomicBool>);

pub(super) fn track(cancel: Arc<AtomicBool>) -> Tracked {
    RUNNING.lock().push(cancel.clone());
    Tracked(cancel)
}

impl Drop for Tracked {
    fn drop(&mut self) {
        RUNNING
            .lock()
            .retain(|cancel| !Arc::ptr_eq(cancel, &self.0));
    }
}

/// Cancels every running build and waits up to `grace` for them to stop:
/// each build's own thread takes its process group down when it sees the
/// switch, and `exit` must not come first.
pub(crate) fn cancel_all(grace: Duration) {
    for cancel in RUNNING.lock().iter() {
        cancel.store(true, Ordering::Relaxed);
    }
    let deadline = Instant::now() + grace;
    while !RUNNING.lock().is_empty() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quitting_cancels_a_running_build_and_waits_for_it_to_stop() {
        let cancel = Arc::new(AtomicBool::new(false));
        let tracked = track(cancel.clone());
        let build = std::thread::spawn(move || {
            while !tracked.0.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(5));
            }
        });
        cancel_all(Duration::from_secs(5));
        assert!(cancel.load(Ordering::Relaxed));
        build.join().unwrap();
        assert!(!RUNNING.lock().iter().any(|c| Arc::ptr_eq(c, &cancel)));
    }
}
