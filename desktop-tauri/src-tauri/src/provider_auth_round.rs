//! One probe round at a time for the Integrations pane's poll.
//!
//! The pane polls every 1.8s without waiting for the last answer, and a round
//! can take seconds — a cold provider CLI was measured past 5s. Queued behind
//! the probe lock, every poll used to run a round of its own the moment it got
//! in, so they piled up. A poll that arrives while a round is running now
//! waits for that round and reads its answer instead.

use std::collections::HashMap;

use parking_lot::{Condvar, Mutex};

use crate::provider_auth_probe::ProbeKey;
use crate::provider_auth_state::AuthSnapshot;

pub type Snapshots = HashMap<ProbeKey, AuthSnapshot>;

#[derive(Default)]
pub struct SharedRound {
    state: Mutex<Round>,
    finished: Condvar,
}

#[derive(Default)]
struct Round {
    running: bool,
    /// Counts finished rounds, so a waiter can tell its round from a later one.
    finished: u64,
    last: Snapshots,
}

impl SharedRound {
    /// Runs `probe`, unless a round is already running: then waits for that
    /// one and returns what it found.
    pub fn run(&self, probe: impl FnOnce() -> Snapshots) -> Snapshots {
        let mut round = self.state.lock();
        if round.running {
            let awaited = round.finished;
            while round.running && round.finished == awaited {
                self.finished.wait(&mut round);
            }
            return round.last.clone();
        }
        round.running = true;
        drop(round);
        let mut finish = Finish {
            shared: self,
            result: None,
        };
        let result = probe();
        finish.result = Some(result.clone());
        result
    }
}

/// Ends the round even if the probe panicked, so no poll waits forever.
struct Finish<'a> {
    shared: &'a SharedRound,
    result: Option<Snapshots>,
}

impl Drop for Finish<'_> {
    fn drop(&mut self) {
        let mut round = self.shared.state.lock();
        round.running = false;
        round.finished += 1;
        if let Some(result) = self.result.take() {
            round.last = result;
        }
        self.shared.finished.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    use super::*;

    #[test]
    fn a_poll_during_a_round_shares_its_answer_instead_of_probing_again() {
        let shared = Arc::new(SharedRound::default());
        let probes = Arc::new(AtomicUsize::new(0));
        let slow = {
            let (shared, probes) = (Arc::clone(&shared), Arc::clone(&probes));
            std::thread::spawn(move || {
                shared.run(|| {
                    probes.fetch_add(1, Ordering::SeqCst);
                    std::thread::sleep(Duration::from_millis(300));
                    Snapshots::from([("codex:default".into(), AuthSnapshot::default())])
                })
            })
        };
        std::thread::sleep(Duration::from_millis(80));
        let shared_answer = shared.run(|| {
            probes.fetch_add(1, Ordering::SeqCst);
            Snapshots::new()
        });
        assert_eq!(probes.load(Ordering::SeqCst), 1);
        assert!(shared_answer.contains_key("codex:default"));
        assert!(slow.join().unwrap().contains_key("codex:default"));
        // Once nothing is running, the next poll probes for itself.
        shared.run(|| {
            probes.fetch_add(1, Ordering::SeqCst);
            Snapshots::new()
        });
        assert_eq!(probes.load(Ordering::SeqCst), 2);
    }
}
