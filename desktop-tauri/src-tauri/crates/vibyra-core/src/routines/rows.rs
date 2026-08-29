//! Turning routine rows into values and back.
//!
//! The `description` field is deliberately *not* stored. It is derived from
//! the rule on every read, so the sentence a user checked before saving and
//! the rule the scheduler actually follows cannot drift apart — which is the
//! failure that makes a person stop trusting a scheduler.

use crate::agent_model::PermissionMode;
use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};
use chrono::{DateTime, Utc};
use rusqlite::params;

use super::schedule::Schedule;
use super::store::{Routine, COLUMNS};

pub(super) fn parse_zone(name: &str) -> CoreResult<chrono_tz::Tz> {
    name.parse()
        .map_err(|_| CoreError::Settings(format!("{name} is not a timezone this build knows")))
}

pub(super) fn from_row(row: &rusqlite::Row<'_>) -> CoreResult<Routine> {
    let spec: String = row.get(5).map_err(sql)?;
    let schedule: Schedule = serde_json::from_str(&spec)
        .map_err(|error| CoreError::Settings(format!("unreadable routine schedule: {error}")))?;
    let permission: String = row.get(7).map_err(sql)?;
    Ok(Routine {
        id: row.get(0).map_err(sql)?,
        agent_id: row.get(1).map_err(sql)?,
        name: row.get(2).map_err(sql)?,
        instruction: row.get(3).map_err(sql)?,
        description: schedule.describe(),
        schedule,
        timezone: row.get(6).map_err(sql)?,
        permission: PermissionMode::parse(&permission),
        enabled: row.get::<_, i64>(8).map_err(sql)? != 0,
        next_run_ms: row.get(9).map_err(sql)?,
        created_ms: row.get(10).map_err(sql)?,
        updated_ms: row.get(11).map_err(sql)?,
    })
}

pub fn list(db: &AgentDb, agent_id: Option<&str>) -> CoreResult<Vec<Routine>> {
    db.with(|connection| {
        let filter = match agent_id {
            Some(_) => "WHERE agent_id = ?1",
            None => "WHERE ?1 IS NULL",
        };
        let query = format!("SELECT {COLUMNS} FROM routines {filter} ORDER BY name");
        let mut statement = connection.prepare(&query).map_err(sql)?;
        let rows = statement
            .query_map(params![agent_id], |row| Ok(from_row(row)))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(sql)?
            .into_iter()
            .collect()
    })
}

pub fn get(db: &AgentDb, id: &str) -> CoreResult<Routine> {
    db.with(|connection| {
        let query = format!("SELECT {COLUMNS} FROM routines WHERE id = ?1");
        connection
            .query_row(&query, params![id], |row| Ok(from_row(row)))
            .map_err(|_| CoreError::Settings(format!("no routine {id}")))?
    })
}

/// Pauses or resumes. Resuming recomputes the next run from now, which is what
/// stops a routine paused for a month from firing the instant it comes back.
pub fn set_enabled(db: &AgentDb, id: &str, enabled: bool) -> CoreResult<Routine> {
    let routine = get(db, id)?;
    let next = if enabled {
        let zone = parse_zone(&routine.timezone)?;
        routine
            .schedule
            .next_after(zone, Utc::now())
            .map(|instant| instant.timestamp_millis())
    } else {
        None
    };
    db.with(|connection| {
        connection
            .execute(
                "UPDATE routines SET enabled = ?1, next_run_ms = ?2, updated_ms = ?3 WHERE id = ?4",
                params![enabled as i64, next, now_ms(), id],
            )
            .map_err(sql)?;
        Ok(())
    })?;
    get(db, id)
}

/// Moves a routine past the run it has just taken.
pub fn advance(db: &AgentDb, id: &str, after: DateTime<Utc>) -> CoreResult<Option<i64>> {
    let routine = get(db, id)?;
    let zone = parse_zone(&routine.timezone)?;
    let next = routine
        .schedule
        .next_after(zone, after)
        .map(|instant| instant.timestamp_millis());
    db.with(|connection| {
        connection
            .execute(
                "UPDATE routines SET next_run_ms = ?1 WHERE id = ?2",
                params![next, id],
            )
            .map_err(sql)?;
        Ok(next)
    })
}

pub fn delete(db: &AgentDb, id: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute("DELETE FROM routines WHERE id = ?1", params![id])
            .map_err(sql)?;
        Ok(())
    })
}
