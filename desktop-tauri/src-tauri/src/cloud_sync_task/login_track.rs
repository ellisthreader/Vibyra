//! When the Codex login is looked at: pure bookkeeping for the worker (no I/O, no clock of its own).
//! The file is polled every minute, but only when the user switched "Use my Codex login in the cloud" on.

/// How often the login file is checked for a change (a local read and hash; no request unless it changed).
pub(super) const LOGIN_POLL_MS: u64 = 60_000;

#[derive(Debug)]
pub(super) struct LoginTrack {
    /// The next time the file is due to be looked at.
    pub(super) next_at: u64,
    /// The next send is explicit (the first after switching on or starting, "Sync now", a new sign-in): it
    /// skips the 10-minute spacing and checks the cloud still has the login.
    pub(super) force: bool,
    /// Consecutive failures of the upload, for the backoff.
    pub(super) failures: u32,
    /// The switch was on at the last look (a flip to on forces a send).
    pub(super) was_on: bool,
    /// The local record was read once at start so the status can say when the login last went up.
    pub(super) seeded: bool,
    /// The switch is off and nothing is left in the cloud to remove.
    pub(super) clean: bool,
    pub(super) retry_remove_at: u64,
}

impl LoginTrack {
    pub(super) fn new(now: u64) -> Self {
        LoginTrack {
            next_at: now,
            force: true,
            failures: 0,
            was_on: false,
            seeded: false,
            clean: false,
            retry_remove_at: 0,
        }
    }

    /// The switch was just read: a flip to on sends at once and explicitly; a flip to off re-arms the removal.
    pub(super) fn switch(&mut self, on: bool, now: u64) {
        if on && !self.was_on {
            self.force = true;
            self.next_at = now;
            self.failures = 0;
        }
        if on {
            self.clean = false;
        }
        self.was_on = on;
    }

    pub(super) fn is_due(&self, on: bool, now: u64) -> bool {
        on && now >= self.next_at
    }

    /// "Sync now", wake from sleep, a new session: send explicitly and right away.
    pub(super) fn explicit(&mut self, now: u64) {
        self.force = true;
        self.next_at = now;
        self.failures = 0;
    }

    pub(super) fn after_ok(&mut self, now: u64, decided: bool) {
        if decided {
            self.force = false;
        }
        self.failures = 0;
        self.next_at = now + LOGIN_POLL_MS;
    }

    pub(super) fn after_wait(&mut self, now: u64, ms: u64) {
        self.next_at = now + ms.min(LOGIN_POLL_MS);
    }

    pub(super) fn after_failure(&mut self, now: u64) {
        self.failures += 1;
        self.next_at = now + super::schedule_types::backoff(self.failures);
    }
}
