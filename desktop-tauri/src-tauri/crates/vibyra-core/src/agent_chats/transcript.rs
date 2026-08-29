//! The append-only transcript: writing events, reading them back in order.
//!
//! `seq` is allocated inside the same transaction as the insert. Taking a
//! count first and inserting after would let two turns racing on one chat pick
//! the same number, and a unique index would then reject the loser's event
//! rather than merely misorder it — a dropped line of history.

use rusqlite::params;

use crate::agent_runtime::AgentEvent;
use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;

use super::record::ChatEventRow;

/// How much of one chat is loaded when it is opened.
///
/// Older events stay in the database and are reachable by paging; they are
/// simply not mounted. A chat that has run for months must open as fast as one
/// opened this morning.
pub const PAGE: i64 = 400;

/// Appends one event and returns the row the frontend should render.
///
/// Streaming deltas are not stored — see `AgentEvent::persisted` — but they
/// still get a sequence number so the UI can order them against the events
/// around them. Their number is simply the one the next stored event will use.
pub fn append(
    db: &AgentDb,
    chat_id: &str,
    turn_id: &str,
    event: AgentEvent,
) -> CoreResult<ChatEventRow> {
    let now = now_ms();
    let event = event.bounded();
    if !event.persisted() {
        return Ok(ChatEventRow {
            chat_id: chat_id.to_string(),
            turn_id: turn_id.to_string(),
            seq: -1,
            created_ms: now,
            event,
        });
    }
    let payload = serde_json::to_string(&event)
        .map_err(|error| crate::error::CoreError::Settings(error.to_string()))?;
    let kind = event.kind();
    let seq = db.transact(|connection| {
        let next: i64 = connection
            .query_row(
                "SELECT COALESCE(MAX(seq), -1) + 1 FROM chat_events WHERE chat_id = ?1",
                params![chat_id],
                |row| row.get(0),
            )
            .map_err(sql)?;
        connection
            .execute(
                "INSERT INTO chat_events (chat_id, turn_id, seq, kind, payload, created_ms) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![chat_id, turn_id, next, kind, payload, now],
            )
            .map_err(sql)?;
        connection
            .execute(
                "UPDATE agent_chats SET updated_ms = ?1 WHERE id = ?2",
                params![now, chat_id],
            )
            .map_err(sql)?;
        Ok(next)
    })?;
    Ok(ChatEventRow {
        chat_id: chat_id.to_string(),
        turn_id: turn_id.to_string(),
        seq,
        created_ms: now,
        event,
    })
}

/// The most recent page of a chat, oldest first.
///
/// Selected newest-first with a limit and then reversed, so the query reads
/// the tail of the index rather than walking the whole chat to reach its end.
pub fn recent(db: &AgentDb, chat_id: &str) -> CoreResult<Vec<ChatEventRow>> {
    read(db, chat_id, i64::MAX, PAGE)
}

/// The page of events immediately *before* `before_seq`, oldest first. What
/// "load earlier" asks for.
pub fn earlier(db: &AgentDb, chat_id: &str, before_seq: i64) -> CoreResult<Vec<ChatEventRow>> {
    read(db, chat_id, before_seq, PAGE)
}

fn read(db: &AgentDb, chat_id: &str, before_seq: i64, limit: i64) -> CoreResult<Vec<ChatEventRow>> {
    db.with(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT turn_id, seq, payload, created_ms FROM chat_events \
                 WHERE chat_id = ?1 AND seq < ?2 ORDER BY seq DESC LIMIT ?3",
            )
            .map_err(sql)?;
        let rows = statement
            .query_map(params![chat_id, before_seq, limit], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(sql)?;
        let mut out = Vec::new();
        for row in rows {
            let (turn_id, seq, payload, created_ms) = row.map_err(sql)?;
            // A payload this build cannot parse is skipped rather than fatal.
            // One unreadable row must not make a whole conversation unopenable.
            let Ok(event) = serde_json::from_str(&payload) else {
                continue;
            };
            out.push(ChatEventRow {
                chat_id: chat_id.to_string(),
                turn_id,
                seq,
                created_ms,
                event,
            });
        }
        out.reverse();
        Ok(out)
    })
}

/// How many events a chat holds. Used by export and by the dashboard, and
/// cheap because the index covers it.
pub fn count(db: &AgentDb, chat_id: &str) -> CoreResult<i64> {
    db.with(|connection| {
        connection
            .query_row(
                "SELECT count(*) FROM chat_events WHERE chat_id = ?1",
                params![chat_id],
                |row| row.get(0),
            )
            .map_err(sql)
    })
}

/// Every event in a chat, oldest first, for export.
///
/// Deliberately separate from `recent`: this one is allowed to be slow and is
/// never called to paint a screen.
pub fn all(db: &AgentDb, chat_id: &str) -> CoreResult<Vec<ChatEventRow>> {
    read(db, chat_id, i64::MAX, i64::MAX)
}
