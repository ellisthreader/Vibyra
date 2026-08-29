//! The one place that says yes.
//!
//! Two properties make this more than a dialog box:
//!
//! * **The card is the contract.** What the user approved is stored, and the
//!   executor performs *that stored row* — it never asks the agent what it
//!   wanted again. So even a perfect forgery of an approval token buys
//!   nothing: the effect that runs is the one the user read.
//! * **The fingerprint invalidates.** If the command, target, payload, cost,
//!   connection or turn changes after the card was raised, the digest no
//!   longer matches and the card is dead rather than merely stale. SHA-256
//!   rather than the cheap hash the terminal prompt scanner uses, because that
//!   one is compared against itself and this one guards a spend.

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::fingerprint::fingerprint;
use super::risk::{decide, forbidden, trustable, Decision, Risk};
use super::rows::get_in;

/// A proposed effect, before anyone has been asked.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedAction {
    pub agent_id: Option<String>,
    pub agent_name: String,
    pub chat_id: Option<String>,
    pub turn_id: Option<String>,
    pub risk: Risk,
    /// The machine-readable action, e.g. `github.create_issue`.
    pub action: String,
    /// What it happens to, in the user's terms: a path, a repository, an
    /// address. This is the line people actually read.
    pub target: String,
    /// The concrete effect, spelled out. Never a summary the agent wrote about
    /// itself — the exact command, body or payload.
    pub detail: String,
    pub cost_usd: Option<f64>,
}

/// A raised card, waiting.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub id: String,
    pub account: String,
    pub agent_id: Option<String>,
    pub agent_name: String,
    pub chat_id: Option<String>,
    pub turn_id: Option<String>,
    pub risk: Risk,
    pub action: String,
    pub target: String,
    pub detail: String,
    pub cost_usd: Option<f64>,
    pub fingerprint: String,
    /// `pending`, `approved`, `denied`, or `invalidated`.
    pub state: String,
    /// Whether the card may offer "don't ask again for this". Derived from the
    /// risk and the agent's permission, never from the request.
    pub trustable: bool,
    pub created_ms: i64,
    pub resolved_ms: Option<i64>,
}

pub(super) const COLUMNS: &str =
    "id, account, agent_id, agent_name, chat_id, turn_id, risk, action, \
     target, detail, cost_usd, fingerprint, state, created_ms, resolved_ms";

/// Raises a card, or answers immediately when policy already knows.
///
/// `writes` is the agent's permission level, which is why a Plan-mode agent's
/// proposed write cannot become a standing permission.
pub enum Outcome {
    /// No approval needed; proceed.
    Allowed,
    /// Refused outright, with the reason to show. Never a question.
    Forbidden(&'static str),
    /// A card is waiting. Boxed because a request is an order of magnitude
    /// larger than the other two answers, and every call site returns one.
    Pending(Box<ApprovalRequest>),
}

pub fn request(
    db: &AgentDb,
    account: &str,
    proposed: ProposedAction,
    writes: bool,
) -> CoreResult<Outcome> {
    if let Some(reason) = forbidden(&proposed.action) {
        return Ok(Outcome::Forbidden(reason));
    }
    if decide(proposed.risk, writes) == Decision::Allowed {
        return Ok(Outcome::Allowed);
    }
    let now = now_ms();
    let record = ApprovalRequest {
        id: new_id(),
        account: account.to_string(),
        agent_id: proposed.agent_id.clone(),
        agent_name: proposed.agent_name.clone(),
        chat_id: proposed.chat_id.clone(),
        turn_id: proposed.turn_id.clone(),
        risk: proposed.risk,
        action: proposed.action.clone(),
        target: proposed.target.clone(),
        detail: proposed.detail.clone(),
        cost_usd: proposed.cost_usd,
        fingerprint: fingerprint(&proposed),
        state: "pending".into(),
        trustable: trustable(proposed.risk, writes),
        created_ms: now,
        resolved_ms: None,
    };
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO approval_requests (id, account, agent_id, agent_name, chat_id, \
                 turn_id, risk, action, target, detail, cost_usd, fingerprint, state, created_ms) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'pending', ?13)",
                params![
                    record.id,
                    record.account,
                    record.agent_id,
                    record.agent_name,
                    record.chat_id,
                    record.turn_id,
                    record.risk.as_str(),
                    record.action,
                    record.target,
                    record.detail,
                    record.cost_usd,
                    record.fingerprint,
                    now,
                ],
            )
            .map_err(sql)?;
        Ok(())
    })?;
    Ok(Outcome::Pending(Box::new(record)))
}

/// Answers a card and hands back what was actually authorised.
///
/// `expected` is the fingerprint the caller believes it is approving. A
/// mismatch means the action moved underneath the card, and nothing is
/// executed — the card is marked invalidated rather than approved, which is a
/// state the user can see rather than a silent no-op.
pub fn resolve(
    db: &AgentDb,
    account: &str,
    id: &str,
    approved: bool,
    expected: Option<&str>,
) -> CoreResult<ApprovalRequest> {
    db.transact(|connection| {
        let mut record = get_in(connection, account, id)?;
        if record.state != "pending" {
            return Err(CoreError::Settings(format!(
                "that decision was already {}",
                record.state
            )));
        }
        if expected.is_some_and(|given| given != record.fingerprint) {
            record.state = "invalidated".into();
        } else {
            record.state = if approved { "approved" } else { "denied" }.into();
        }
        record.resolved_ms = Some(now_ms());
        connection
            .execute(
                "UPDATE approval_requests SET state = ?1, resolved_ms = ?2 WHERE id = ?3",
                params![record.state, record.resolved_ms, id],
            )
            .map_err(sql)?;
        Ok(record)
    })
}
