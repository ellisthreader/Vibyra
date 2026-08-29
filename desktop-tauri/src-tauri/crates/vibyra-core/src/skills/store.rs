//! Installing, versioning and assigning skills.

use rusqlite::params;

use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::record::{Skill, SkillDraft, SkillOrigin, COLUMNS};
use super::versions::{get_in, snapshot};

/// Writes a skill. `origin` decides whether it lands installed or proposed:
/// an agent-authored skill is a standing instruction the user has not read
/// yet, so it waits.
pub fn install(
    db: &AgentDb,
    account: &str,
    draft: SkillDraft,
    origin: SkillOrigin,
) -> CoreResult<Skill> {
    let name = draft.name.trim();
    if name.is_empty() {
        return Err(CoreError::Settings("a skill needs a name".into()));
    }
    if draft.procedure.trim().is_empty() {
        return Err(CoreError::Settings(
            "a skill needs a procedure — what should the agent actually do?".into(),
        ));
    }
    // Credentials are forbidden in a skill for the same reason they are
    // forbidden in memory: it is a stored, injected, searchable string.
    for field in [&draft.procedure, &draft.trigger, &draft.boundary] {
        if crate::agent_memory::looks_like_a_secret(field) {
            return Err(CoreError::Settings(
                "that skill looks like it carries a credential. Skills are injected into every \
                 matching turn — keep the secret in the keyring and refer to it by name."
                    .into(),
            ));
        }
    }

    let now = now_ms();
    let skill = Skill {
        id: new_id(),
        account: account.to_string(),
        name: name.chars().take(80).collect(),
        summary: draft.summary.trim().chars().take(200).collect(),
        version: 1,
        trigger: draft.trigger.trim().chars().take(400).collect(),
        procedure: draft.procedure.trim().chars().take(8_000).collect(),
        verification: draft.verification.trim().chars().take(2_000).collect(),
        boundary: draft.boundary.trim().chars().take(2_000).collect(),
        origin,
        status: if origin == SkillOrigin::Agent {
            "proposed".into()
        } else {
            "installed".into()
        },
        created_ms: now,
        updated_ms: now,
    };
    db.transact(|connection| {
        connection
            .execute(
                "INSERT INTO skills (id, account, name, summary, version, trigger, procedure, \
                 verification, boundary, origin, status, created_ms, updated_ms) \
                 VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
                params![
                    skill.id,
                    skill.account,
                    skill.name,
                    skill.summary,
                    skill.trigger,
                    skill.procedure,
                    skill.verification,
                    skill.boundary,
                    skill.origin.as_str(),
                    skill.status,
                    now,
                ],
            )
            .map_err(sql)?;
        snapshot(connection, &skill)
    })?;
    Ok(skill)
}

/// Replaces a skill's text and bumps its version, keeping the old one.
///
/// The previous text is snapshotted first, so an edit that turns out to be
/// wrong is a rollback rather than an archaeology exercise — and so an audit
/// record naming version 3 can still be read after version 4 exists.
pub fn revise(db: &AgentDb, account: &str, id: &str, draft: SkillDraft) -> CoreResult<Skill> {
    db.transact(|connection| {
        let mut skill = get_in(connection, account, id)?;
        snapshot(connection, &skill)?;
        skill.version += 1;
        skill.name = draft.name.trim().chars().take(80).collect();
        skill.summary = draft.summary.trim().chars().take(200).collect();
        skill.trigger = draft.trigger.trim().chars().take(400).collect();
        skill.procedure = draft.procedure.trim().chars().take(8_000).collect();
        skill.verification = draft.verification.trim().chars().take(2_000).collect();
        skill.boundary = draft.boundary.trim().chars().take(2_000).collect();
        skill.updated_ms = now_ms();
        connection
            .execute(
                "UPDATE skills SET name = ?1, summary = ?2, version = ?3, trigger = ?4, \
                 procedure = ?5, verification = ?6, boundary = ?7, updated_ms = ?8 \
                 WHERE id = ?9 AND account = ?10",
                params![
                    skill.name,
                    skill.summary,
                    skill.version,
                    skill.trigger,
                    skill.procedure,
                    skill.verification,
                    skill.boundary,
                    skill.updated_ms,
                    id,
                    account,
                ],
            )
            .map_err(sql)?;
        Ok(skill)
    })
}

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
