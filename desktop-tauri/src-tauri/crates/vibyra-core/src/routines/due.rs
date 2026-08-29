//! Whether a routine should run right now.
//!
//! Kept apart from the run records so the policy can be tested without a
//! database, a clock or a provider — which is the only way to check "what
//! happens after a week offline" without waiting a week.
//!
//! That case is the one this file is really about. Reopening after a week must
//! not fire seven days of standups: the value of a standing check is that it
//! is current, and a burst of stale ones is noise, plus cost, plus — if any of
//! them can write — several agents racing on one folder.

use chrono::{DateTime, Utc};

use crate::agentdb::AgentDb;
use crate::error::CoreResult;

use super::rows::list;
use super::runs::{in_flight, GRACE_MINUTES, MAX_CONCURRENT};
use super::store::Routine;

/// What a tick decided about one routine.
#[derive(Debug, Clone, PartialEq)]
pub enum Due {
    /// Run it now.
    Run,
    /// Its moment passed while the app was closed. Record and move on.
    Skip,
    /// Not yet.
    Wait,
}

/// Whether `routine` should run at `now`.
///
/// Split from the tick so the policy is testable without a database, a clock
/// or a provider — which is the only way to test "what happens after a week
/// offline" without waiting a week.
///
/// `agent_allows` is the agent's own routine permission, read fresh each tick.
/// Turning it off has to stop existing routines, not merely prevent new ones —
/// otherwise the switch means "no more of these" rather than "not this agent",
/// which is what a person turning it off is asking for.
pub fn due(routine: &Routine, now: DateTime<Utc>, running: bool, agent_allows: bool) -> Due {
    if !routine.enabled || running || !agent_allows {
        return Due::Wait;
    }
    let Some(next_ms) = routine.next_run_ms else {
        return Due::Wait;
    };
    let now_ms = now.timestamp_millis();
    if now_ms < next_ms {
        return Due::Wait;
    }
    let late_minutes = (now_ms - next_ms) / 60_000;
    if late_minutes > GRACE_MINUTES {
        Due::Skip
    } else {
        Due::Run
    }
}

/// Everything that should happen on this tick, capped.
///
/// Returns the routines to run and the ones to record as skipped. The caller
/// does the running; keeping that out of here is what lets the decision be
/// tested on its own.
pub fn plan_tick(db: &AgentDb, now: DateTime<Utc>) -> CoreResult<(Vec<Routine>, Vec<Routine>)> {
    let busy = in_flight(db)?;
    let mut run = Vec::new();
    let mut skip = Vec::new();
    for routine in list(db, None)? {
        let already = busy.contains(&routine.id);
        let allows = crate::agent_profiles::routines_allowed(db, &routine.agent_id);
        match due(&routine, now, already, allows) {
            Due::Run if run.len() < MAX_CONCURRENT.saturating_sub(busy.len()) => run.push(routine),
            // Over the cap this tick: left alone, still due, picked up next
            // tick rather than dropped.
            Due::Run => {}
            Due::Skip => skip.push(routine),
            Due::Wait => {}
        }
    }
    Ok((run, skip))
}
