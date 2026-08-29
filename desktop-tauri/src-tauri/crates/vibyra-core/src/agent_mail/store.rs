//! Delivering a handoff, and the audit trail both ends can read.

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;

use super::guards::{self, Refusal, SendContext};
use super::queries::{
    allowed, chain_length, chain_of, digest_of, hop_of, recently_sent, since_last,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailMessage {
    pub id: String,
    /// Every message descended from one original handoff shares this, which is
    /// what makes "how long has this been bouncing" answerable.
    pub chain_id: String,
    pub parent_id: Option<String>,
    pub sender_id: Option<String>,
    pub sender_name: String,
    pub recipient_id: Option<String>,
    /// The fresh chat this woke the recipient into.
    pub chat_id: Option<String>,
    pub body: String,
    /// `delivered`, `refused`, or `awaitingApproval`.
    pub status: String,
    pub hop: i64,
    pub created_ms: i64,
}

/// A handoff, before the guards have seen it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Handoff {
    pub sender_id: String,
    pub sender_name: String,
    pub recipient_id: String,
    pub body: String,
    /// The message this answers, if any. Absent starts a new chain.
    #[serde(default)]
    pub parent_id: Option<String>,
}

/// What happened to a handoff.
pub enum Delivery {
    /// Wake the recipient in this fresh chat.
    Delivered(MailMessage),
    /// It asked for something outward-facing; a decision was raised instead.
    NeedsApproval {
        message: MailMessage,
        phrase: &'static str,
    },
    Refused(Refusal),
}

/// Runs every guard, then records the outcome either way.
///
/// A refusal is stored, not dropped. Both agents' audit trails have to show
/// that a message was attempted and why it did not land — otherwise a user
/// debugging "why did nothing happen" has nothing to read.
pub fn send(
    db: &AgentDb,
    paused: bool,
    handoff: Handoff,
    recipient_name: &str,
    recipient_accepts: bool,
) -> CoreResult<Delivery> {
    let chain = match &handoff.parent_id {
        Some(parent) => chain_of(db, parent)?.unwrap_or_else(new_id),
        None => new_id(),
    };
    let hop = match &handoff.parent_id {
        Some(parent) => hop_of(db, parent)?.unwrap_or(0) + 1,
        None => 1,
    };
    let digest = digest_of(&handoff.body);
    let context = SendContext {
        paused,
        sender_id: &handoff.sender_id,
        recipient_id: &handoff.recipient_id,
        recipient_name,
        recipient_accepts,
        allowed: allowed(db, &handoff.sender_id, &handoff.recipient_id)?,
        hop,
        chain_messages: chain_length(db, &chain)?,
        duplicate: recently_sent(db, &handoff.sender_id, &digest)?,
        since_last_ms: since_last(db, &handoff.sender_id)?,
    };

    if let Some(refusal) = guards::refuse(&context) {
        record(db, &handoff, &chain, hop, "refused", &digest, None)?;
        return Ok(Delivery::Refused(refusal));
    }

    match guards::needs_approval(&handoff.body) {
        Some(phrase) => {
            let message = record(db, &handoff, &chain, hop, "awaitingApproval", &digest, None)?;
            Ok(Delivery::NeedsApproval { message, phrase })
        }
        None => {
            let message = record(db, &handoff, &chain, hop, "delivered", &digest, None)?;
            Ok(Delivery::Delivered(message))
        }
    }
}

/// Notes which chat a delivered handoff woke the recipient into.
pub fn attach_chat(db: &AgentDb, message_id: &str, chat_id: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE agent_mail SET chat_id = ?1 WHERE id = ?2",
                params![chat_id, message_id],
            )
            .map_err(sql)?;
        Ok(())
    })
}

fn record(
    db: &AgentDb,
    handoff: &Handoff,
    chain: &str,
    hop: i64,
    status: &str,
    digest: &str,
    chat_id: Option<&str>,
) -> CoreResult<MailMessage> {
    let message = MailMessage {
        id: new_id(),
        chain_id: chain.to_string(),
        parent_id: handoff.parent_id.clone(),
        sender_id: Some(handoff.sender_id.clone()),
        sender_name: handoff.sender_name.clone(),
        recipient_id: Some(handoff.recipient_id.clone()),
        chat_id: chat_id.map(str::to_string),
        body: handoff.body.trim().chars().take(4_000).collect(),
        status: status.to_string(),
        hop,
        created_ms: now_ms(),
    };
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO agent_mail (id, chain_id, parent_id, sender_id, sender_name, \
                 recipient_id, chat_id, body, status, hop, digest, created_ms) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    message.id,
                    message.chain_id,
                    message.parent_id,
                    message.sender_id,
                    message.sender_name,
                    message.recipient_id,
                    message.chat_id,
                    message.body,
                    message.status,
                    message.hop,
                    digest,
                    message.created_ms,
                ],
            )
            .map_err(sql)?;
        Ok(())
    })?;
    Ok(message)
}
