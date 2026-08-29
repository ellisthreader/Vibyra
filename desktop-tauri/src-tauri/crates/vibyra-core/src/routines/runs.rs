//! Which routines are due, and the record of what happened when they ran.
//!
//! The policy that matters most is what happens after the app has been shut
//! for a week. Reopening must not fire seven days of standups: the value of a
//! standing check is that it is current, and a burst of stale ones is noise
//! plus cost plus, if any of them can write, seven agents racing on one
//! folder. Missed runs are recorded as skipped and the schedule moves on.

use chrono::{DateTime, Utc};
use rusqlite::params;

use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;

use super::rows::advance;
use super::store::RoutineRun;

/// How many structured turns a routine tick may start at once.
///
/// Low on purpose. These run unattended beside whatever the user is doing, and
/// a scheduler that can saturate the machine is one people turn off.
pub const MAX_CONCURRENT: usize = 3;

/// A routine that is late but not *that* late still runs. Beyond this it is
/// stale, and running it would answer a question nobody is still asking.
pub const GRACE_MINUTES: i64 = 30;

/// Opens a run record.
pub fn begin(
    db: &AgentDb,
    routine_id: &str,
    chat_id: Option<&str>,
    scheduled_ms: i64,
) -> CoreResult<RoutineRun> {
    let run = RoutineRun {
        id: new_id(),
        routine_id: routine_id.to_string(),
        chat_id: chat_id.map(str::to_string),
        scheduled_ms,
        started_ms: Some(now_ms()),
        ended_ms: None,
        status: "running".into(),
        error: None,
    };
    insert(db, &run)?;
    Ok(run)
}

/// Records a run that never happened, so the row still says the routine was
/// meant to fire — a gap in the history is indistinguishable from a routine
/// that was never scheduled.
pub fn skip(db: &AgentDb, routine_id: &str, scheduled_ms: i64) -> CoreResult<RoutineRun> {
    let run = RoutineRun {
        id: new_id(),
        routine_id: routine_id.to_string(),
        chat_id: None,
        scheduled_ms,
        started_ms: None,
        ended_ms: Some(now_ms()),
        status: "skipped".into(),
        error: Some("Vibyra was not running when this was due.".into()),
    };
    insert(db, &run)?;
    Ok(run)
}

/// Closes a run.
pub fn finish(db: &AgentDb, run_id: &str, error: Option<&str>) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE routine_runs SET status = ?1, error = ?2, ended_ms = ?3 WHERE id = ?4",
                params![
                    if error.is_some() {
                        "failed"
                    } else {
                        "completed"
                    },
                    error,
                    now_ms(),
                    run_id
                ],
            )
            .map_err(sql)?;
        Ok(())
    })
}

/// Clears runs left `running` by a crash, for the same reason chats are.
pub fn reset_running(db: &AgentDb) -> CoreResult<usize> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE routine_runs SET status = 'failed', ended_ms = ?1, \
                 error = 'Vibyra closed while this was running.' WHERE status = 'running'",
                params![now_ms()],
            )
            .map_err(sql)
    })
}

/// The most recent runs of one routine, newest first.
pub fn history(db: &AgentDb, routine_id: &str, limit: i64) -> CoreResult<Vec<RoutineRun>> {
    db.with(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT id, routine_id, chat_id, scheduled_ms, started_ms, ended_ms, status, error \
                 FROM routine_runs WHERE routine_id = ?1 ORDER BY scheduled_ms DESC LIMIT ?2",
            )
            .map_err(sql)?;
        let rows = statement
            .query_map(params![routine_id, limit], |row| {
                Ok(RoutineRun {
                    id: row.get(0)?,
                    routine_id: row.get(1)?,
                    chat_id: row.get(2)?,
                    scheduled_ms: row.get(3)?,
                    started_ms: row.get(4)?,
                    ended_ms: row.get(5)?,
                    status: row.get(6)?,
                    error: row.get(7)?,
                })
            })
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql)
    })
}

/// Every run still marked running, across all routines. The concurrency cap
/// and the one-run-per-routine rule are both read off this.
pub fn in_flight(db: &AgentDb) -> CoreResult<Vec<String>> {
    db.with(|connection| {
        let mut statement = connection
            .prepare("SELECT routine_id FROM routine_runs WHERE status = 'running'")
            .map_err(sql)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql)
    })
}

fn insert(db: &AgentDb, run: &RoutineRun) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO routine_runs (id, routine_id, chat_id, scheduled_ms, started_ms, \
                 ended_ms, status, error, created_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    run.id,
                    run.routine_id,
                    run.chat_id,
                    run.scheduled_ms,
                    run.started_ms,
                    run.ended_ms,
                    run.status,
                    run.error,
                    now_ms(),
                ],
            )
            .map_err(sql)?;
        Ok(())
    })
}

/// Advances a routine past the moment it just handled, whether it ran or was
/// skipped. Always called, or a skipped routine stays permanently due.
pub fn advance_past(db: &AgentDb, routine_id: &str, handled: DateTime<Utc>) -> CoreResult<()> {
    advance(db, routine_id, handled)?;
    Ok(())
}
