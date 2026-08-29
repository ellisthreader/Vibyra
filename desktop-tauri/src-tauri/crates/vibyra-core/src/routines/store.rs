//! Routines and their runs, as stored.

use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::agent_model::PermissionMode;
use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::rows::{get, parse_zone};
use super::schedule::Schedule;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Routine {
    pub id: String,
    pub agent_id: String,
    pub name: String,
    pub instruction: String,
    pub schedule: Schedule,
    pub timezone: String,
    /// Routines default to Plan. A standing schedule with write access is a
    /// thing that changes files while nobody is looking, so raising it is a
    /// separate, explicit choice rather than a default inherited from the
    /// agent.
    pub permission: PermissionMode,
    pub enabled: bool,
    pub next_run_ms: Option<i64>,
    /// Not stored — resolved on read so a rule and its sentence cannot drift.
    pub description: String,
    pub created_ms: i64,
    pub updated_ms: i64,
}

/// A run that happened, or is happening.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineRun {
    pub id: String,
    pub routine_id: String,
    pub chat_id: Option<String>,
    pub scheduled_ms: i64,
    pub started_ms: Option<i64>,
    pub ended_ms: Option<i64>,
    /// `running`, `completed`, `failed`, or `skipped`.
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineDraft {
    pub agent_id: String,
    pub name: String,
    pub instruction: String,
    pub schedule: Schedule,
    pub timezone: String,
    #[serde(default)]
    pub permission: Option<PermissionMode>,
}

pub(super) const COLUMNS: &str =
    "id, agent_id, name, instruction, schedule_kind, schedule_spec, timezone, \
     permission, enabled, next_run_ms, created_ms, updated_ms";

/// Saves a routine and resolves its first run.
pub fn create(db: &AgentDb, draft: RoutineDraft) -> CoreResult<Routine> {
    if !crate::agent_profiles::routines_allowed(db, &draft.agent_id) {
        return Err(CoreError::Settings(
            "that teammate has scheduled work turned off. Turn it on in its settings first.".into(),
        ));
    }
    let routine = build(new_id(), &draft, now_ms(), now_ms())?;
    write(db, &routine, true)?;
    Ok(routine)
}

/// Replaces a routine's rule, recomputing when it next fires.
pub fn update(db: &AgentDb, id: &str, draft: RoutineDraft) -> CoreResult<Routine> {
    let existing = get(db, id)?;
    let routine = build(id.to_string(), &draft, existing.created_ms, now_ms())?;
    write(db, &routine, false)?;
    Ok(routine)
}

fn build(id: String, draft: &RoutineDraft, created: i64, updated: i64) -> CoreResult<Routine> {
    draft.schedule.valid().map_err(CoreError::Settings)?;
    let name = draft.name.trim();
    if name.is_empty() {
        return Err(CoreError::Settings("a routine needs a name".into()));
    }
    if draft.instruction.trim().is_empty() {
        return Err(CoreError::Settings(
            "a routine needs an instruction — what should it do each time?".into(),
        ));
    }
    let zone = parse_zone(&draft.timezone)?;
    let next = draft
        .schedule
        .next_after(zone, Utc::now())
        .map(|instant| instant.timestamp_millis());
    Ok(Routine {
        id,
        agent_id: draft.agent_id.clone(),
        name: name.chars().take(80).collect(),
        instruction: draft.instruction.trim().chars().take(4_000).collect(),
        description: draft.schedule.describe(),
        schedule: draft.schedule.clone(),
        timezone: zone.name().to_string(),
        permission: draft.permission.unwrap_or(PermissionMode::Plan),
        enabled: true,
        next_run_ms: next,
        created_ms: created,
        updated_ms: updated,
    })
}

fn write(db: &AgentDb, routine: &Routine, insert: bool) -> CoreResult<()> {
    let spec = serde_json::to_string(&routine.schedule)
        .map_err(|error| CoreError::Settings(error.to_string()))?;
    let kind = match routine.schedule {
        Schedule::Daily { .. } => "daily",
        Schedule::Weekdays { .. } => "weekdays",
        Schedule::Every { .. } => "every",
    };
    db.with(|connection| {
        let statement = if insert {
            "INSERT INTO routines (id, agent_id, name, instruction, schedule_kind, \
             schedule_spec, timezone, permission, enabled, next_run_ms, created_ms, updated_ms) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"
        } else {
            "INSERT INTO routines (id, agent_id, name, instruction, schedule_kind, \
             schedule_spec, timezone, permission, enabled, next_run_ms, created_ms, updated_ms) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) \
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, \
             instruction = excluded.instruction, schedule_kind = excluded.schedule_kind, \
             schedule_spec = excluded.schedule_spec, timezone = excluded.timezone, \
             permission = excluded.permission, next_run_ms = excluded.next_run_ms, \
             updated_ms = excluded.updated_ms"
        };
        connection
            .execute(
                statement,
                params![
                    routine.id,
                    routine.agent_id,
                    routine.name,
                    routine.instruction,
                    kind,
                    spec,
                    routine.timezone,
                    routine.permission.as_str(),
                    routine.enabled as i64,
                    routine.next_run_ms,
                    routine.created_ms,
                    routine.updated_ms,
                ],
            )
            .map_err(sql)?;
        Ok(())
    })
}
