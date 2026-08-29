//! Storing, ranking and correcting what an agent knows.

use rusqlite::params;

use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::record::{MemoryClass, MemoryEntry, MemoryStatus, COLUMNS};
use super::secrets::looks_like_a_secret;

/// One entry's cap. Memory is a set of short durable statements; a paragraph
/// that will not fit in this is a document, and belongs in a place.
const MAX_BODY: usize = 1_200;

/// A proposed or hand-written entry.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMemory {
    pub class: MemoryClass,
    pub body: String,
    #[serde(default)]
    pub priority: Option<i64>,
    #[serde(default)]
    pub source_chat: Option<String>,
    #[serde(default)]
    pub source_turn: Option<String>,
}

/// Writes an entry at `status`.
///
/// The secret check is here rather than in the reflection policy so that it
/// also covers the user typing one in by hand — every path to a stored row
/// passes through this function.
pub fn record(
    db: &AgentDb,
    agent_id: &str,
    request: NewMemory,
    status: MemoryStatus,
) -> CoreResult<MemoryEntry> {
    let body = request.body.trim();
    if body.is_empty() {
        return Err(CoreError::Settings(
            "a memory needs something to say".into(),
        ));
    }
    if looks_like_a_secret(body) {
        return Err(CoreError::Settings(
            "that looks like a credential. Memory never stores secrets — keep it in the keyring \
             and record where it lives instead."
                .into(),
        ));
    }
    let now = now_ms();
    let entry = MemoryEntry {
        id: new_id(),
        agent_id: agent_id.to_string(),
        class: request.class,
        body: body.chars().take(MAX_BODY).collect(),
        priority: request.priority.unwrap_or(50).clamp(0, 100),
        pinned: false,
        status,
        source_chat: request.source_chat,
        source_turn: request.source_turn,
        created_ms: now,
        updated_ms: now,
    };
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO memory_entries (id, agent_id, class, body, priority, status, \
                 source_chat, source_turn, created_ms, updated_ms) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                params![
                    entry.id,
                    entry.agent_id,
                    entry.class.as_str(),
                    entry.body,
                    entry.priority,
                    entry.status.as_str(),
                    entry.source_chat,
                    entry.source_turn,
                    now,
                ],
            )
            .map_err(sql)?;
        Ok(())
    })?;
    Ok(entry)
}

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
