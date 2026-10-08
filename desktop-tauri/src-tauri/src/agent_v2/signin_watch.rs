//! After a `provider_signin` wait the backend parks the run until this Mac
//! re-registers. Signing back in to the *same* AI account changes nothing
//! the runner compares, so it watches the account's sign-in state and
//! re-registers (rotating the runner key) when it becomes signed in.
//! Pure, so the transitions are unit-tested; the runner supplies probes.

use std::time::{Duration, Instant};

const PROBE_EVERY: Duration = Duration::from_secs(10);
/// Signed in all along (the CLI refreshed its own login): retry, backing off.
const FIRST_RETRY: Duration = Duration::from_secs(5 * 60);
const MAX_RETRY: Duration = Duration::from_secs(60 * 60);

/// The runner's view: the current watch (if a run is parked) and its backoff.
#[derive(Debug, Default)]
pub struct Parked {
    pub watch: Option<SigninWatch>,
    pub retries: u32,
}

impl Parked {
    /// After a run: start watching when it ended waiting for the AI sign-in.
    pub fn after(&mut self, signin_wait: bool) {
        if signin_wait {
            self.watch = Some(SigninWatch::parked(Instant::now(), self.retries));
        }
    }
}

#[derive(Debug)]
pub struct SigninWatch {
    parked_at: Instant,
    last_probe: Option<Instant>,
    seen_signed_out: bool,
    retries: u32,
}

impl SigninWatch {
    pub fn parked(now: Instant, retries: u32) -> Self {
        SigninWatch {
            parked_at: now,
            last_probe: None,
            seen_signed_out: false,
            retries,
        }
    }

    pub fn due(&self, now: Instant) -> bool {
        self.last_probe
            .is_none_or(|at| now.duration_since(at) >= PROBE_EVERY)
    }

    /// Feeds one probe of the selected account; `true` means re-register now.
    pub fn observe(&mut self, signed_in: bool, now: Instant) -> bool {
        self.last_probe = Some(now);
        if !signed_in {
            self.seen_signed_out = true;
            return false;
        }
        if self.seen_signed_out {
            return true;
        }
        let wait = FIRST_RETRY
            .saturating_mul(1 << self.retries.min(4))
            .min(MAX_RETRY);
        now.duration_since(self.parked_at) >= wait
    }

    /// Retries carried into the next park: a real sign-in resets the backoff.
    pub fn next_retries(&self) -> u32 {
        if self.seen_signed_out {
            0
        } else {
            self.retries + 1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signing_out_then_back_in_re_registers_at_once() {
        let start = Instant::now();
        let mut watch = SigninWatch::parked(start, 0);
        assert!(watch.due(start));
        assert!(!watch.observe(false, start));
        assert!(!watch.due(start + Duration::from_secs(3)));
        assert!(watch.due(start + PROBE_EVERY));
        assert!(watch.observe(true, start + PROBE_EVERY));
        assert_eq!(watch.next_retries(), 0);
    }

    #[test]
    fn signed_in_all_along_retries_with_backoff() {
        let start = Instant::now();
        let mut watch = SigninWatch::parked(start, 0);
        assert!(!watch.observe(true, start + Duration::from_secs(60)));
        assert!(watch.observe(true, start + FIRST_RETRY));
        assert_eq!(watch.next_retries(), 1);
        let mut again = SigninWatch::parked(start, watch.next_retries());
        assert!(!again.observe(true, start + FIRST_RETRY));
        assert!(again.observe(true, start + FIRST_RETRY * 2));
        let mut capped = SigninWatch::parked(start, 30);
        assert!(capped.observe(true, start + MAX_RETRY));
    }
}

#[cfg(test)]
mod parked_tests {
    use super::Parked;

    #[test]
    fn only_a_signin_wait_starts_the_watch() {
        let mut parked = Parked::default();
        parked.after(false);
        assert!(parked.watch.is_none());
        parked.after(true);
        assert!(parked.watch.is_some());
    }
}
