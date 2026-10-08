//! Recording how an upload or a poll went: success clears the failures, a failure backs off.

use super::schedule::Scheduler;
use super::schedule_types::{backoff, Failure, AUTH_PAUSE_MS, POLL_MS};

impl Scheduler {
    pub fn begin_sync(&mut self, id: &str) {
        self.busy = true;
        if let Some(slot) = self.slots.get_mut(id) {
            slot.running_generation = slot.generation;
        }
    }

    pub fn end_sync(&mut self, id: &str, result: Result<(), Failure>, now: u64) {
        self.busy = false;
        match result {
            Ok(()) => {
                self.global_failures = 0;
                if let Some(slot) = self.slots.get_mut(id) {
                    slot.failures = 0;
                    slot.retry_at = 0;
                    // An edit that landed while the upload ran stays due.
                    if slot.generation == slot.running_generation {
                        slot.due = None;
                        slot.first_dirty = None;
                    }
                }
            }
            Err(kind) => {
                if let Some(slot) = self.slots.get_mut(id) {
                    slot.failures += 1;
                    slot.retry_at = now + backoff(slot.failures);
                    slot.due = Some(slot.retry_at);
                }
                self.fail(kind, now);
            }
        }
    }

    pub fn begin_poll(&mut self) {
        self.busy = true;
    }

    pub fn end_poll(&mut self, result: Result<(), Failure>, now: u64) {
        self.busy = false;
        match result {
            Ok(()) => {
                self.poll_failures = 0;
                self.poll_at = now + POLL_MS;
            }
            Err(kind) => {
                self.poll_failures += 1;
                self.poll_at = now + backoff(self.poll_failures).max(POLL_MS);
                self.fail(kind, now);
            }
        }
    }

    /// A failure that is not one project's: offline pauses everything with growing waits, a refused session for longer.
    pub fn fail(&mut self, kind: Failure, now: u64) {
        match kind {
            Failure::Network => {
                self.global_failures += 1;
                self.pause_until = now + backoff(self.global_failures);
            }
            Failure::Auth => self.pause_until = now + AUTH_PAUSE_MS,
            Failure::Project => {}
        }
    }
}
