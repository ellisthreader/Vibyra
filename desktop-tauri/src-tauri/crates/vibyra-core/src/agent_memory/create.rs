use super::{looks_like_a_secret, MemoryClass, MemoryEntry, MemoryStatus};
use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};
use rusqlite::params;

pub fn record(
    db: &AgentDb,
    agent_id: &str,
    request: NewMemory,
    status: MemoryStatus,
) -> CoreResult<MemoryEntry> {
    record_once(db, agent_id, request, status, None)
}

/// One entry's cap. Memory is a set of short durable statements; a paragraph
/// that will not fit in this is a document, and belongs in a place.
pub(super) const MAX_BODY: usize = 1_200;

/// A proposed or hand-written entry.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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
pub fn record_once(
    db: &AgentDb,
    agent_id: &str,
    request: NewMemory,
    status: MemoryStatus,
    token: Option<&str>,
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
        source_chat: request.source_chat.clone(),
        source_turn: request.source_turn.clone(),
        created_ms: now,
        updated_ms: now,
    };
    crate::agentdb::requests::once(
        db,
        agent_id,
        "memory.add",
        token,
        &(&request, status),
        |connection| {
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
            Ok(entry.clone())
        },
    )
}
