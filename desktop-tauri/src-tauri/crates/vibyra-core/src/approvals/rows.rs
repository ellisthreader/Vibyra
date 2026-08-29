//! Reading approval rows back.
//!
//! Kept apart from `broker`, which decides things. One notable choice lives
//! here: `trustable` is *recomputed* on read rather than stored, because
//! whether a standing yes may be offered depends on the agent's permission
//! now, not on what it was when the card was raised.

use rusqlite::params;

use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::broker::{ApprovalRequest, COLUMNS};
use super::risk::{trustable, Risk};

pub(super) fn get_in(
    connection: &rusqlite::Connection,
    account: &str,
    id: &str,
) -> CoreResult<ApprovalRequest> {
    let query = format!("SELECT {COLUMNS} FROM approval_requests WHERE id = ?1 AND account = ?2");
    connection
        .query_row(&query, params![id, account], |row| Ok(from_row(row)))
        .map_err(|_| CoreError::Settings(format!("no decision {id} on this account")))?
}

pub(super) fn from_row(row: &rusqlite::Row<'_>) -> CoreResult<ApprovalRequest> {
    let risk: String = row.get(6).map_err(sql)?;
    let risk = Risk::parse(&risk);
    Ok(ApprovalRequest {
        id: row.get(0).map_err(sql)?,
        account: row.get(1).map_err(sql)?,
        agent_id: row.get(2).map_err(sql)?,
        agent_name: row.get(3).map_err(sql)?,
        chat_id: row.get(4).map_err(sql)?,
        turn_id: row.get(5).map_err(sql)?,
        risk,
        action: row.get(7).map_err(sql)?,
        target: row.get(8).map_err(sql)?,
        detail: row.get(9).map_err(sql)?,
        cost_usd: row.get(10).map_err(sql)?,
        fingerprint: row.get(11).map_err(sql)?,
        state: row.get(12).map_err(sql)?,
        // Recomputed rather than stored: whether a standing yes may be offered
        // depends on the agent's permission *now*, not when the card was made.
        trustable: trustable(risk, true),
        created_ms: row.get(13).map_err(sql)?,
        resolved_ms: row.get(14).map_err(sql)?,
    })
}

/// Kills every card raised for a turn that is no longer running.
///
/// A cancelled or failed turn's questions are not questions any more, and a
/// card that outlives its turn is the classic way a stale yes authorises
/// something nobody is watching.
pub fn invalidate_turn(db: &AgentDb, turn_id: &str) -> CoreResult<usize> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE approval_requests SET state = 'invalidated', resolved_ms = ?1 \
                 WHERE turn_id = ?2 AND state = 'pending'",
                params![now_ms(), turn_id],
            )
            .map_err(sql)
    })
}

/// Cards still waiting, newest first.
pub fn pending(db: &AgentDb, account: &str) -> CoreResult<Vec<ApprovalRequest>> {
    db.with(|connection| {
        let query = format!(
            "SELECT {COLUMNS} FROM approval_requests \
             WHERE account = ?1 AND state = 'pending' ORDER BY created_ms DESC LIMIT 100"
        );
        let mut statement = connection.prepare(&query).map_err(sql)?;
        let rows = statement
            .query_map(params![account], |row| Ok(from_row(row)))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(sql)?
            .into_iter()
            .collect()
    })
}
