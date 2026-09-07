//! Storing, ranking and correcting what an agent knows.

use super::create::MAX_BODY;
use rusqlite::params;

use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::record::{MemoryEntry, MemoryStatus, COLUMNS};
use super::secrets::looks_like_a_secret;

/// Everything this agent knows or has been asked to know, ranked.
pub fn list(db: &AgentDb, agent_id: &str) -> CoreResult<Vec<MemoryEntry>> {
    db.with(|connection| {
        let query = format!(
            "SELECT {COLUMNS} FROM memory_entries WHERE agent_id = ?1 \
             ORDER BY pinned DESC, priority DESC, updated_ms DESC LIMIT 1000"
        );
        let mut statement = connection.prepare(&query).map_err(sql)?;
        let rows = statement
            .query_map(params![agent_id], |row| Ok(MemoryEntry::from_row(row)))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(sql)?
            .into_iter()
            .collect()
    })
}

/// Approves, rejects, archives or reactivates an entry.
pub fn set_status(db: &AgentDb, id: &str, status: MemoryStatus) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE memory_entries SET status = ?1, updated_ms = ?2 WHERE id = ?3",
                params![status.as_str(), now_ms(), id],
            )
            .map_err(sql)?;
        Ok(())
    })
}

/// Corrects an entry in place.
///
/// Editing rather than deleting-and-re-adding on purpose: the row keeps its
/// provenance, so "where did this come from" still answers after the text has
/// been fixed.
pub fn amend(
    db: &AgentDb,
    id: &str,
    body: Option<&str>,
    priority: Option<i64>,
    pinned: Option<bool>,
) -> CoreResult<()> {
    if let Some(body) = body {
        if looks_like_a_secret(body) {
            return Err(CoreError::Settings(
                "that looks like a credential. Memory never stores secrets.".into(),
            ));
        }
    }
    db.with(|connection| {
        connection
            .execute(
                "UPDATE memory_entries SET \
                 body = COALESCE(?1, body), \
                 priority = COALESCE(?2, priority), \
                 pinned = COALESCE(?3, pinned), \
                 updated_ms = ?4 WHERE id = ?5",
                params![
                    body.map(|text| text.trim().chars().take(MAX_BODY).collect::<String>()),
                    priority.map(|value| value.clamp(0, 100)),
                    pinned.map(|value| value as i64),
                    now_ms(),
                    id,
                ],
            )
            .map_err(sql)?;
        Ok(())
    })
}

pub fn delete(db: &AgentDb, id: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute("DELETE FROM memory_entries WHERE id = ?1", params![id])
            .map_err(sql)?;
        Ok(())
    })
}
