//! Installing, versioning and assigning skills.

use rusqlite::params;

use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::record::{Skill, SkillDraft, SkillOrigin};
use super::versions::{get_in, snapshot};

/// Writes a skill. `origin` decides whether it lands installed or proposed:
/// an agent-authored skill is a standing instruction the user has not read
/// yet, so it waits.
pub fn install_once(
    db: &AgentDb,
    account: &str,
    draft: SkillDraft,
    origin: SkillOrigin,
    token: Option<&str>,
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
    crate::agentdb::requests::once(
        db,
        account,
        "skill.install",
        token,
        &(&draft, origin),
        |connection| {
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
            snapshot(connection, &skill)?;
            Ok(skill.clone())
        },
    )
}

/// Replaces a skill's text and bumps its version, keeping the old one.
///
/// The previous text is snapshotted first, so an edit that turns out to be
/// wrong is a rollback rather than an archaeology exercise — and so an audit
/// record naming version 3 can still be read after version 4 exists.
pub fn revise_once(
    db: &AgentDb,
    account: &str,
    id: &str,
    draft: SkillDraft,
    token: Option<&str>,
) -> CoreResult<Skill> {
    crate::agentdb::requests::once(
        db,
        account,
        "skill.revise",
        token,
        &(id, &draft),
        |connection| {
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
        },
    )
}

pub fn install(
    db: &AgentDb,
    account: &str,
    draft: SkillDraft,
    origin: SkillOrigin,
) -> CoreResult<Skill> {
    install_once(db, account, draft, origin, None)
}
pub fn revise(db: &AgentDb, account: &str, id: &str, draft: SkillDraft) -> CoreResult<Skill> {
    revise_once(db, account, id, draft, None)
}
