//! Reads and writes of the place grants.
//!
//! Separate from the profile store because a grant is the security-relevant
//! half: `grant_place` canonicalises before it writes, so two spellings of one
//! folder can never become two different permissions, and `insert_place` is
//! shared with agent creation so an agent's own home is granted by exactly the
//! same path as any folder the user picks.

use rusqlite::params;

use crate::agent_model::PlaceAccess;
use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::places::{canonical_place, AgentPlace};

/// The folders this agent may use, home first.
pub fn list_places(db: &AgentDb, agent_id: &str) -> CoreResult<Vec<AgentPlace>> {
    db.with(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT id, agent_id, path, access, label, created_ms FROM agent_places \
                 WHERE agent_id = ?1 ORDER BY created_ms",
            )
            .map_err(sql)?;
        let rows = statement
            .query_map(params![agent_id], |row| {
                Ok(AgentPlace {
                    id: row.get(0)?,
                    agent_id: row.get(1)?,
                    path: row.get(2)?,
                    access: PlaceAccess::parse(&row.get::<_, String>(3)?),
                    label: row.get(4)?,
                    created_ms: row.get(5)?,
                })
            })
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql)
    })
}

/// Grants a folder, canonicalised first so two spellings cannot become two
/// permissions. Re-granting an existing place changes its access level.
pub fn grant_place(
    db: &AgentDb,
    agent_id: &str,
    path: &str,
    access: PlaceAccess,
) -> CoreResult<AgentPlace> {
    let canonical = canonical_place(path)?;
    let stored = canonical.to_string_lossy().into_owned();
    let label = canonical
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| stored.clone());
    let now = now_ms();
    db.with(|connection| insert_place(connection, agent_id, &stored, access, &label, now))?;
    list_places(db, agent_id)?
        .into_iter()
        .find(|place| place.path == stored)
        .ok_or_else(|| CoreError::Settings("the place could not be granted".into()))
}

pub(super) fn insert_place(
    connection: &rusqlite::Connection,
    agent_id: &str,
    path: &str,
    access: PlaceAccess,
    label: &str,
    now: i64,
) -> CoreResult<()> {
    connection
        .execute(
            "INSERT INTO agent_places (id, agent_id, path, access, label, created_ms) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT(agent_id, path) DO UPDATE SET access = excluded.access",
            params![new_id(), agent_id, path, access.as_str(), label, now],
        )
        .map_err(sql)?;
    Ok(())
}

/// Withdraws a grant. Takes effect on the next turn and the next routine run;
/// turns already in flight keep the grants they were authorised with, which is
/// what their audit record says they had.
pub fn revoke_place(db: &AgentDb, agent_id: &str, place_id: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "DELETE FROM agent_places WHERE id = ?1 AND agent_id = ?2",
                params![place_id, agent_id],
            )
            .map_err(sql)?;
        Ok(())
    })
}
