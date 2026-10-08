//! The timings and the small types the scheduler speaks in.

/// A burst of edits waits for this much quiet before it uploads.
pub const DEBOUNCE_MS: u64 = 15_000;
/// ...but a project edited without a pause still goes up this often.
pub const MAX_WAIT_MS: u64 = 120_000;
/// Every enabled project is looked at this often, whatever the watcher said.
pub const SWEEP_MS: u64 = 120_000;
/// How often the cloud is asked for changes it made.
pub const POLL_MS: u64 = 60_000;
/// Retry delays after consecutive failures; the last one repeats.
pub(super) const BACKOFF_MS: [u64; 6] = [30_000, 60_000, 120_000, 300_000, 600_000, 900_000];
/// A refused sign-in is not retried until the user acts (or a sweep after this long).
pub(super) const AUTH_PAUSE_MS: u64 = 300_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Failure {
    /// Offline, timed out, 5xx: everything waits, nothing is lost.
    Network,
    /// The session was refused: everything waits for a new sign-in.
    Auth,
    /// This project only (a bad folder, too large, a git problem).
    Project,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    Sync(String),
    Poll,
    /// Nothing to do; look again after this many milliseconds.
    Idle(u64),
}

pub fn backoff(failures: u32) -> u64 {
    let index = (failures.max(1) as usize - 1).min(BACKOFF_MS.len() - 1);
    BACKOFF_MS[index]
}
