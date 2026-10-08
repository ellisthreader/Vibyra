//! The background thread: waits for messages (file changes, focus loss, "sync now"),
//! runs the worker whenever something may be due, and keeps the file watchers in
//! step with the projects being synced. It also notices the Mac waking from sleep.

use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant, SystemTime};

use super::port::{Env, Port};
use super::watch::Watchers;
use super::worker::{Msg, Worker};

/// Longest sleep between looks, so a sleep/wake gap is noticed within seconds.
const MAX_SLICE: Duration = Duration::from_secs(5);
/// Wall-clock time that passed beyond the monotonic clock: the machine was asleep.
const SLEEP_GAP: Duration = Duration::from_secs(30);

pub fn run<P: Port, E: Env>(mut worker: Worker<P, E>, rx: Receiver<Msg>, tx: Sender<Msg>) {
    let mut watchers = Watchers::default();
    let mut watched: Vec<(String, String)> = Vec::new();
    let (mut mono, mut wall) = (Instant::now(), SystemTime::now());
    let mut wait = 0u64;
    loop {
        match rx
            .recv_timeout(Duration::from_millis(wait).clamp(Duration::from_millis(1), MAX_SLICE))
        {
            Ok(Msg::Shutdown) | Err(RecvTimeoutError::Disconnected) => return,
            Ok(msg) => worker.handle(msg),
            Err(RecvTimeoutError::Timeout) => {}
        }
        while let Ok(msg) = rx.try_recv() {
            if matches!(msg, Msg::Shutdown) {
                return;
            }
            worker.handle(msg);
        }
        let asleep = wall
            .elapsed()
            .unwrap_or_default()
            .saturating_sub(mono.elapsed());
        (mono, wall) = (Instant::now(), SystemTime::now());
        if asleep > SLEEP_GAP {
            worker.handle(Msg::Wake);
        }
        wait = loop {
            if let Some(ms) = worker.step() {
                break ms;
            }
        };
        let wanted = worker.watch_roots();
        if wanted != watched {
            watchers.reconcile(&wanted, &tx);
            watched = wanted;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud_sync_task::board::Board;
    use crate::cloud_sync_task::port::Config;
    use crate::cloud_sync_task::worker_fake::{Fake, FakeEnv, FakePort};
    use parking_lot::Mutex;
    use std::sync::mpsc::channel;
    use std::sync::Arc;
    use vibyra_core::cloud_sync_settings::{CloudSyncSettings, CLOUD_SYNC_CONSENT_VERSION};
    use vibyra_sync::ProjectRef;

    #[test]
    fn the_real_thread_syncs_flushes_on_request_and_stops_on_shutdown() {
        let folder = tempfile::tempdir().unwrap();
        let fake = Arc::new(Fake {
            cloud_enabled: Mutex::new(true),
            ..Default::default()
        });
        let cfg = Arc::new(Mutex::new(Config {
            signed_in: true,
            sync: CloudSyncSettings {
                consent_version: CLOUD_SYNC_CONSENT_VERSION,
                ..Default::default()
            },
            projects: vec![ProjectRef {
                id: "a".into(),
                name: "A".into(),
                root: folder.path().to_path_buf(),
            }],
            mac_name: "Mac".into(),
        }));
        let started = Instant::now();
        let worker = Worker::new(
            FakePort(Arc::clone(&fake)),
            FakeEnv {
                cfg,
                events: Arc::new(Mutex::new(Vec::new())),
            },
            Board::default(),
            Box::new(move || started.elapsed().as_millis() as u64 + 1),
        );
        let (tx, rx) = channel();
        let thread = {
            let tx = tx.clone();
            std::thread::spawn(move || run(worker, rx, tx))
        };
        let (ack, done) = channel();
        tx.send(Msg::FlushAndAck(ack)).unwrap();
        done.recv_timeout(Duration::from_secs(5))
            .expect("the first pass finished");
        assert!(
            fake.calls.lock().iter().any(|c| c.starts_with("sync a")),
            "the project was synced"
        );
        tx.send(Msg::Shutdown).unwrap();
        thread.join().unwrap();
    }
}
