use std::collections::HashMap;
use std::io::Write;
use std::process::{Child, ChildStdin};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use crate::provider_auth_output::ProcessOutput;

/// Cancelling and quitting live next door, as a child module so they can
/// still reach the store's private fields.
#[path = "provider_auth_attempt_stop.rs"]
mod stop;

/// A login that exits without the account showing up has not succeeded, but
/// the probe that proves it needs a moment to run.
const SUCCESS_SETTLE_WINDOW: Duration = Duration::from_secs(3);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum AttemptState {
    #[default]
    None,
    Running,
    Failed,
}

#[derive(Default)]
pub struct AttemptView {
    pub state: AttemptState,
    /// The tracked child is installing the CLI rather than signing in. Both
    /// are spawn-and-watch; only what the row says about them differs.
    pub installing: bool,
    pub sign_in_page_available: bool,
    /// What the CLI is waiting to be told, empty when it is not waiting.
    pub prompt: String,
    /// Why it went wrong, so a failure can be quoted instead of guessed at.
    pub failure_line: String,
}

struct Attempt {
    child: Child,
    /// Kept open for the whole attempt: a provider sign-in that ends by asking
    /// for a pasted code cannot complete unless something can still type.
    stdin: Option<ChildStdin>,
    installing: bool,
    failed: bool,
    finished_at: Option<Instant>,
    output: Arc<Mutex<ProcessOutput>>,
}

#[derive(Default)]
pub struct LoginAttemptStore {
    attempts: Mutex<HashMap<String, Attempt>>,
}

impl LoginAttemptStore {
    pub fn start(
        &self,
        id: &str,
        installing: bool,
        mut child: Child,
        output: Arc<Mutex<ProcessOutput>>,
    ) {
        self.cancel(id);
        let stdin = child.stdin.take();
        self.attempts.lock().insert(
            id.into(),
            Attempt {
                child,
                stdin,
                installing,
                failed: false,
                finished_at: None,
                output,
            },
        );
    }

    pub fn finish_connected(&self, id: &str) {
        self.cancel(id);
    }

    /// Which accounts have a sign-in or install still in play: running, or
    /// exited cleanly and inside the settle window where the probe has to
    /// confirm it. A failed attempt stays listed to explain itself, but its
    /// account is not expected to change, so it is not force-probed forever.
    ///
    /// These are exactly the accounts whose answer is expected to change at
    /// any moment, so the probe cache must not speak for them.
    pub fn active_ids(&self) -> Vec<String> {
        let now = Instant::now();
        let mut attempts = self.attempts.lock();
        attempts
            .iter_mut()
            .filter_map(|(id, attempt)| (!attempt.observe(now)).then(|| id.clone()))
            .collect()
    }

    pub fn sign_in_url(&self, id: &str) -> Option<String> {
        self.attempts
            .lock()
            .get(id)
            .map(|attempt| attempt.output.lock().url())
    }

    /// Types `line` at the CLI, which is the only way a sign-in that ends on
    /// "paste the code" can ever finish.
    pub fn submit(&self, id: &str, line: &str) -> Result<(), String> {
        let mut attempts = self.attempts.lock();
        let attempt = attempts
            .get_mut(id)
            .ok_or_else(|| "Start account authorization first.".to_string())?;
        let stdin = attempt
            .stdin
            .as_mut()
            .ok_or_else(|| "This sign-in is not accepting input.".to_string())?;
        writeln!(stdin, "{line}")
            .and_then(|()| stdin.flush())
            .map_err(|error| format!("Could not send that to the provider: {error}"))?;
        attempt.output.lock().mark_answered();
        Ok(())
    }

    /// Clears a finished install so the row goes back to reporting the CLI
    /// itself. Returns true when one succeeded, which is the caller's cue to
    /// re-resolve PATH — a package just landed in a directory that may not
    /// have existed when the app started.
    pub fn take_finished_install(&self) -> bool {
        let mut installed = false;
        let mut attempts = self.attempts.lock();
        attempts.retain(|_, attempt| {
            if !attempt.installing {
                return true;
            }
            match attempt.child.try_wait() {
                Ok(Some(status)) if status.success() => {
                    installed = true;
                    false
                }
                _ => true,
            }
        });
        installed
    }

    pub fn view(&self, id: &str) -> AttemptView {
        let mut attempts = self.attempts.lock();
        let Some(attempt) = attempts.get_mut(id) else {
            return AttemptView::default();
        };
        attempt.observe(Instant::now());
        let output = attempt.output.lock();
        AttemptView {
            state: if attempt.failed {
                AttemptState::Failed
            } else {
                AttemptState::Running
            },
            installing: attempt.installing,
            sign_in_page_available: !output.url().is_empty(),
            prompt: output.prompt(),
            failure_line: output.failure_line(),
        }
    }
}

impl Attempt {
    /// Folds in whether the child has exited, reaping it if so, and returns
    /// whether the attempt has failed.
    fn observe(&mut self, now: Instant) -> bool {
        match self.child.try_wait() {
            Ok(Some(status)) if !status.success() => self.failed = true,
            Ok(Some(_)) if self.finished_at.is_none() => self.finished_at = Some(now),
            Ok(_) => {}
            Err(_) => self.failed = true,
        }
        if settled_without_connection(self.finished_at, now) {
            self.failed = true;
        }
        self.failed
    }
}

fn settled_without_connection(finished_at: Option<Instant>, now: Instant) -> bool {
    finished_at.is_some_and(|finished| now.duration_since(finished) >= SUCCESS_SETTLE_WINDOW)
}

#[cfg(test)]
#[path = "provider_auth_attempt_tests.rs"]
mod tests;
