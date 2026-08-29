//! The lookups the guards need before a send can be judged.
//!
//! Each answers one question about history: how deep is this chain, how long,
//! has this exact message just gone out, and how recently did this sender
//! speak. Kept together because they share one rule that is easy to get
//! wrong — **a refused message does not count**. A send stopped for being too
//! fast must not then be stopped for being a repeat of itself, and a refusal
//! must not consume a chain's message budget.

use rusqlite::params;
use sha2::{Digest, Sha256};

use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;

use super::allow::allowlist;
use super::guards::DUPLICATE_WINDOW_MS;
use super::store::MailMessage;

pub(super) fn chain_of(db: &AgentDb, parent: &str) -> CoreResult<Option<String>> {
    single(db, "SELECT chain_id FROM agent_mail WHERE id = ?1", parent)
}

pub(super) fn hop_of(db: &AgentDb, parent: &str) -> CoreResult<Option<i64>> {
    db.with(|connection| {
        Ok(connection
            .query_row(
                "SELECT hop FROM agent_mail WHERE id = ?1",
                params![parent],
                |row| row.get(0),
            )
            .ok())
    })
}

pub(super) fn chain_length(db: &AgentDb, chain: &str) -> CoreResult<i64> {
    db.with(|connection| {
        connection
            .query_row(
                "SELECT count(*) FROM agent_mail WHERE chain_id = ?1 AND status != 'refused'",
                params![chain],
                |row| row.get(0),
            )
            .map_err(sql)
    })
}

/// Only delivered messages count as duplicates: a send refused for being too
/// fast must not then be refused for being a repeat of itself.
pub(super) fn recently_sent(db: &AgentDb, sender: &str, digest: &str) -> CoreResult<bool> {
    db.with(|connection| {
        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM agent_mail WHERE sender_id = ?1 AND digest = ?2 \
                 AND status != 'refused' AND created_ms > ?3",
                params![sender, digest, now_ms() - DUPLICATE_WINDOW_MS],
                |row| row.get(0),
            )
            .map_err(sql)?;
        Ok(count > 0)
    })
}

pub(super) fn since_last(db: &AgentDb, sender: &str) -> CoreResult<Option<i64>> {
    db.with(|connection| {
        let last: Option<i64> = connection
            .query_row(
                "SELECT MAX(created_ms) FROM agent_mail WHERE sender_id = ?1 AND status != 'refused'",
                params![sender],
                |row| row.get(0),
            )
            .ok()
            .flatten();
        Ok(last.map(|when| now_ms() - when))
    })
}

fn single(db: &AgentDb, query: &str, id: &str) -> CoreResult<Option<String>> {
    db.with(|connection| {
        Ok(connection
            .query_row(query, params![id], |row| row.get::<_, String>(0))
            .ok())
    })
}

pub(super) fn digest_of(body: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(body.trim().to_lowercase().as_bytes());
    format!("{:x}", hasher.finalize())[..16].to_string()
}

/// One agent's mail, sent and received, newest first.
pub fn trail(db: &AgentDb, agent_id: &str, limit: i64) -> CoreResult<Vec<MailMessage>> {
    db.with(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT id, chain_id, parent_id, sender_id, sender_name, recipient_id, chat_id, \
                 body, status, hop, created_ms FROM agent_mail \
                 WHERE sender_id = ?1 OR recipient_id = ?1 ORDER BY created_ms DESC LIMIT ?2",
            )
            .map_err(sql)?;
        let rows = statement
            .query_map(params![agent_id, limit], |row| {
                Ok(MailMessage {
                    id: row.get(0)?,
                    chain_id: row.get(1)?,
                    parent_id: row.get(2)?,
                    sender_id: row.get(3)?,
                    sender_name: row.get(4)?,
                    recipient_id: row.get(5)?,
                    chat_id: row.get(6)?,
                    body: row.get(7)?,
                    status: row.get(8)?,
                    hop: row.get(9)?,
                    created_ms: row.get(10)?,
                })
            })
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql)
    })
}

pub(super) fn allowed(db: &AgentDb, sender: &str, recipient: &str) -> CoreResult<bool> {
    Ok(allowlist(db, sender)?.iter().any(|peer| peer == recipient))
}
