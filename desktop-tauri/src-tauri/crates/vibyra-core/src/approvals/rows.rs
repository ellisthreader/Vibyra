//! Reading approval rows back.
//!
//! Kept apart from `broker`, which decides things. One choice here is
//! load-bearing: `trustable` — whether the card may offer "don't ask again" —
//! is *recomputed on read* from the agent's permission as it stands now,
//! rather than stored when the card was raised.
//!
//! Which means every read has to join the agent to find that permission. It
//! is not optional and it is not a detail: reading it as a constant `true`
//! offers a standing yes for a write proposed by a Plan-mode agent, which is
//! precisely the case `risk::decide` refuses. A `LEFT JOIN`, because a card
//! outlives the agent that asked for it — and an agent that is gone can hold
//! no permission, so its cards are never trustable.

use rusqlite::params;

use crate::agent_model::PermissionMode;
use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::broker::ApprovalRequest;
use super::risk::{trustable, Risk};

/// The columns every read selects: the card, then the agent's permission as it
/// stands now. Qualified because both tables carry an `id` and an `account`.
const JOINED: &str = "SELECT r.id, r.account, r.agent_id, r.agent_name, r.chat_id, r.turn_id, \
     r.risk, r.action, r.target, r.detail, r.cost_usd, r.fingerprint, r.state, r.created_ms, \
     r.resolved_ms, p.permission FROM approval_requests r \
     LEFT JOIN agent_profiles p ON p.id = r.agent_id";

pub(super) fn get_in(
    connection: &rusqlite::Connection,
    account: &str,
    id: &str,
) -> CoreResult<ApprovalRequest> {
    let query = format!("{JOINED} WHERE r.id = ?1 AND r.account = ?2");
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
        created_ms: row.get(13).map_err(sql)?,
        resolved_ms: row.get(14).map_err(sql)?,
        // A missing permission is an agent that has been deleted, or a Chat
        // Mode card that never had one. Neither may be trusted away.
        trustable: trustable(risk, writes_now(row)?),
    })
}

/// Whether the agent behind this card may currently write at all.
fn writes_now(row: &rusqlite::Row<'_>) -> CoreResult<bool> {
    let permission: Option<String> = row.get(15).map_err(sql)?;
    Ok(permission
        .map(|level| PermissionMode::parse(&level).writes())
        .unwrap_or(false))
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
            "{JOINED} WHERE r.account = ?1 AND r.state = 'pending' \
                     ORDER BY r.created_ms DESC LIMIT 100"
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
