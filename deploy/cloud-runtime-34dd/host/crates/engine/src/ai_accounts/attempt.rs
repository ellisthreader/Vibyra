//! One provider sign-in process: how it is watched until it succeeds, fails or
//! is stopped. The store that holds one per provider is in `attempts.rs`.
use super::output::ProcessOutput;
use parking_lot::Mutex;
use std::{
    process::{Child, ChildStdin},
    sync::Arc,
    time::{Duration, Instant},
};
use vibyra_core::process_group;

/// How long a cancelled or timed-out CLI gets to exit on its own.
pub(super) const STOP_GRACE: Duration = Duration::from_millis(300);

#[derive(Clone, Copy)]
pub(super) struct Limits {
    /// How long a sign-in may stay open before it is stopped.
    pub login: Duration,
    /// How often a running attempt is looked at.
    pub tick: Duration,
    /// A login that exited cleanly has this long to show up as connected.
    pub settle: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            login: Duration::from_secs(600),
            tick: Duration::from_millis(250),
            settle: Duration::from_secs(3),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Phase {
    None,
    Running,
    /// Exited cleanly; the next status probe decides whether it worked.
    Exited,
    Failed,
    TimedOut,
    Cancelled,
}

pub(super) struct AttemptView {
    pub phase: Phase,
    pub sign_in_page_available: bool,
    pub device_code: String,
    pub prompt: String,
    pub failure_line: String,
}

pub(super) struct Attempt {
    pub(super) child: Child,
    pub(super) stdin: Option<ChildStdin>,
    pub(super) output: Arc<Mutex<ProcessOutput>>,
    pub(super) started: Instant,
    pub(super) finished_at: Option<Instant>,
    pub(super) phase: Phase,
    pub(super) serial: u64,
}

impl Attempt {
    pub(super) fn observe(&mut self, now: Instant, limits: &Limits) {
        if matches!(self.phase, Phase::Failed | Phase::TimedOut) {
            return;
        }
        match self.child.try_wait() {
            Ok(Some(status)) if !status.success() => self.phase = Phase::Failed,
            Ok(Some(_)) => {
                let finished = *self.finished_at.get_or_insert(now);
                self.phase = if now.duration_since(finished) >= limits.settle {
                    Phase::Failed
                } else {
                    Phase::Exited
                };
            }
            Ok(None) if now.duration_since(self.started) >= limits.login => {
                drop(self.stdin.take());
                process_group::stop(&mut self.child, STOP_GRACE);
                self.phase = Phase::TimedOut;
            }
            Ok(None) => {}
            Err(_) => self.phase = Phase::Failed,
        }
    }

    pub(super) fn stop(mut self) {
        drop(self.stdin.take());
        process_group::stop(&mut self.child, STOP_GRACE);
    }
}
