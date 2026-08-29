//! Skill history, and rolling back to it.
//!
//! A version is snapshotted *before* the edit that supersedes it, so the
//! history holds every text that has ever been injected into a turn. That is
//! what lets an audit record naming version 3 still be read after version 4
//! exists — and why rolling back is itself an edit that makes a version 5,
//! rather than a rewrite that quietly deletes the mistake.

use rusqlite::params;

use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::record::{Skill, SkillDraft, COLUMNS};
use super::store::revise;

/// Every stored version of a skill, newest first.
pub fn history(db: &AgentDb, skill_id: &str) -> CoreResult<Vec<Skill>> {
    db.with(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT snapshot FROM skill_versions WHERE skill_id = ?1 ORDER BY version DESC",
            )
            .map_err(sql)?;
        let rows = statement
            .query_map(params![skill_id], |row| row.get::<_, String>(0))
            .map_err(sql)?;
        Ok(rows
            .filter_map(Result::ok)
            .filter_map(|json| serde_json::from_str(&json).ok())
            .collect())
    })
}

/// Restores a previous version as a new one.
///
/// Forward rather than backward: rolling back is itself an edit, and the
/// history keeps every step, including the mistake.
pub fn roll_back(db: &AgentDb, account: &str, skill_id: &str, version: i64) -> CoreResult<Skill> {
    let wanted = history(db, skill_id)?
        .into_iter()
        .find(|entry: &Skill| entry.version == version)
        .ok_or_else(|| CoreError::Settings(format!("that skill has no version {version}")))?;
    revise(
        db,
        account,
        skill_id,
        SkillDraft {
            name: wanted.name,
            summary: wanted.summary,
            trigger: wanted.trigger,
            procedure: wanted.procedure,
            verification: wanted.verification,
            boundary: wanted.boundary,
        },
    )
}

pub(super) fn snapshot(connection: &rusqlite::Connection, skill: &Skill) -> CoreResult<()> {
    let json =
        serde_json::to_string(skill).map_err(|error| CoreError::Settings(error.to_string()))?;
    connection
        .execute(
            "INSERT OR IGNORE INTO skill_versions (id, skill_id, version, snapshot, created_ms) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![new_id(), skill.id, skill.version, json, now_ms()],
        )
        .map_err(sql)?;
    Ok(())
}

pub(super) fn get_in(
    connection: &rusqlite::Connection,
    account: &str,
    id: &str,
) -> CoreResult<Skill> {
    let query = format!("SELECT {COLUMNS} FROM skills WHERE id = ?1 AND account = ?2");
    connection
        .query_row(&query, params![id, account], |row| Ok(Skill::from_row(row)))
        .map_err(|_| CoreError::Settings(format!("no skill {id} on this account")))?
}
