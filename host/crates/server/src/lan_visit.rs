//! "Ask every time" asks once per visit, not once per socket. iOS closes the
//! phone's socket whenever the phone locks, so asking on every new socket left
//! the phone waiting on the computer after each unlock. A visit the computer
//! approved carries over reconnects until the phone has been away for 30
//! minutes or 8 hours have passed, the same visit as remote access (Face ID).
//! A mode change, restriction or account reset bumps `lan_generation`, which
//! ends every visit; a revoked phone is no longer trusted at all. Kept in
//! memory only, so a restarted computer asks again.
use crate::state::Shared;
use std::{
    collections::HashMap,
    sync::atomic::Ordering,
    time::{Duration, Instant},
};

const AWAY: Duration = Duration::from_secs(30 * 60);
const LONGEST: Duration = Duration::from_secs(8 * 60 * 60);

#[derive(Clone, Copy)]
pub struct Visit {
    started: Instant,
    seen: Instant,
    generation: u64,
}

pub type Visits = HashMap<String, Visit>;

fn open(visit: &Visit, generation: u64, now: Instant) -> bool {
    visit.generation == generation
        && now.saturating_duration_since(visit.seen) <= AWAY
        && now.saturating_duration_since(visit.started) <= LONGEST
}

impl Shared {
    /// The computer just approved this phone in "Ask every time".
    pub(crate) fn begin_lan_visit(&self, id: &str, generation: u64) {
        let now = Instant::now();
        if let Ok(mut visits) = self.lan_visits.lock() {
            visits.insert(
                id.into(),
                Visit {
                    started: now,
                    seen: now,
                    generation,
                },
            );
        }
    }

    /// Whether this phone may reconnect without asking, refreshing the visit when it may.
    pub(crate) fn resume_lan_visit(&self, id: &str) -> bool {
        let (now, generation) = (Instant::now(), self.lan_generation.load(Ordering::SeqCst));
        let Ok(mut visits) = self.lan_visits.lock() else {
            return false;
        };
        visits.retain(|_, visit| open(visit, generation, now));
        visits.get_mut(id).map(|visit| visit.seen = now).is_some()
    }

    /// The phone's connection ended: the 30 minutes away start now.
    pub(crate) fn touch_lan_visit(&self, id: &str) {
        if let Ok(mut visits) = self.lan_visits.lock() {
            if let Some(visit) = visits.get_mut(id) {
                visit.seen = Instant::now();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_visit_ends_after_thirty_minutes_away_eight_hours_or_a_policy_change() {
        let start = Instant::now();
        let visit = Visit {
            started: start,
            seen: start,
            generation: 4,
        };
        assert!(open(&visit, 4, start + Duration::from_secs(29 * 60)));
        assert!(!open(&visit, 4, start + Duration::from_secs(31 * 60)));
        assert!(!open(&visit, 5, start));
        let returning = Visit {
            seen: start + Duration::from_secs(8 * 3600),
            ..visit
        };
        assert!(open(&returning, 4, start + Duration::from_secs(8 * 3600)));
        assert!(!open(
            &returning,
            4,
            start + Duration::from_secs(8 * 3600 + 60)
        ));
    }
}
