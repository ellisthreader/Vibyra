//! Ending attempts: one on cancel, all of them when the app quits.

use super::{Attempt, LoginAttemptStore};
use crate::provider_auth_process::{stop_child, STOP_GRACE};

impl LoginAttemptStore {
    pub fn cancel(&self, id: &str) {
        // Taken out first: stopping waits on the child, and the lock must not
        // be held across that.
        let attempt = self.attempts.lock().remove(id);
        if let Some(mut attempt) = attempt {
            drop(attempt.stdin.take());
            stop_child(&mut attempt.child);
        }
    }

    /// Stops every sign-in and install at once when the app quits. Tauri ends
    /// the process with `exit`, so the `Drop` below never gets to run.
    pub fn shutdown(&self) {
        let attempts = std::mem::take(&mut *self.attempts.lock());
        stop_attempts(attempts.into_values());
    }
}

impl Drop for LoginAttemptStore {
    fn drop(&mut self) {
        stop_attempts(self.attempts.get_mut().drain().map(|(_, attempt)| attempt));
    }
}

/// Signals every child first and waits for them together.
fn stop_attempts(attempts: impl Iterator<Item = Attempt>) {
    let mut attempts = attempts.collect::<Vec<_>>();
    for attempt in &mut attempts {
        drop(attempt.stdin.take());
    }
    vibyra_core::process_group::stop_all(
        attempts.iter_mut().map(|attempt| &mut attempt.child),
        STOP_GRACE,
    );
}
