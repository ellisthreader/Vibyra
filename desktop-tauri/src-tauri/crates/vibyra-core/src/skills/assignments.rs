use super::record::{Skill, COLUMNS};
use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;
use rusqlite::params;

/// Approves a proposal, or retires a skill.
pub fn set_status(db: &AgentDb, account: &str, id: &str, status: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE skills SET status = ?1, updated_ms = ?2 WHERE id = ?3 AND account = ?4",
                params![status, now_ms(), id, account],
            )
            .map_err(sql)?;
        Ok(())
    })
}

pub fn list(db: &AgentDb, account: &str) -> CoreResult<Vec<Skill>> {
    db.with(|connection| {
        let query =
            format!("SELECT {COLUMNS} FROM skills WHERE account = ?1 ORDER BY status, name");
        let mut statement = connection.prepare(&query).map_err(sql)?;
        let rows = statement
            .query_map(params![account], |row| Ok(Skill::from_row(row)))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(sql)?
            .into_iter()
            .collect()
    })
}

/// The installed skills one agent has been given.
pub fn assigned(db: &AgentDb, account: &str, agent_id: &str) -> CoreResult<Vec<Skill>> {
    db.with(|connection| {
        let query = format!(
            "SELECT {COLUMNS} FROM skills s \
             JOIN agent_skill_grants g ON g.skill_id = s.id \
             WHERE s.account = ?1 AND g.agent_id = ?2 AND g.enabled = 1 \
               AND s.status = 'installed' ORDER BY s.name"
        );
        let mut statement = connection.prepare(&query).map_err(sql)?;
        let rows = statement
            .query_map(params![account, agent_id], |row| Ok(Skill::from_row(row)))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(sql)?
            .into_iter()
            .collect()
    })
}

/// Gives a skill to an agent, or takes it back.
pub fn assign(db: &AgentDb, agent_id: &str, skill_id: &str, enabled: bool) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO agent_skill_grants (agent_id, skill_id, enabled) VALUES (?1, ?2, ?3) \
                 ON CONFLICT(agent_id, skill_id) DO UPDATE SET enabled = excluded.enabled",
                params![agent_id, skill_id, enabled as i64],
            )
            .map_err(sql)?;
        Ok(())
    })
}
