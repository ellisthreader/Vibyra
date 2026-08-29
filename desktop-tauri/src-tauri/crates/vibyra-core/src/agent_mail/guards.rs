//! The reasons one agent may not write to another.
//!
//! Agent-to-agent messaging is the feature most able to spend a person's money
//! while they are making coffee. Two agents that can wake each other are a
//! loop; a loop that costs a model call per hop is a bill. So the guards are
//! not a rate limiter bolted on afterwards — they are the interface, and the
//! send path cannot be reached except through them.
//!
//! Every refusal names itself, because "your agents stopped talking" with no
//! reason is indistinguishable from a bug.

use serde::{Deserialize, Serialize};

/// How deep a handoff chain may go. Three is enough for "ask the reviewer,
/// who asks the tester"; beyond that nobody is reading the result anyway.
pub const MAX_HOPS: i64 = 3;

/// Messages in one chain, however they branch.
pub const MAX_CHAIN_MESSAGES: i64 = 8;

/// The same agent may not send the same thing twice inside this window.
pub const DUPLICATE_WINDOW_MS: i64 = 10 * 60 * 1_000;

/// Nor send anything at all faster than this.
pub const COOLDOWN_MS: i64 = 5_000;

/// Why a send was refused.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "reason", rename_all = "camelCase")]
pub enum Refusal {
    /// Messaging is off app-wide.
    Paused,
    /// The recipient has not enabled messaging.
    RecipientClosed { name: String },
    /// The recipient is not on the sender's allowlist.
    NotAllowed { name: String },
    /// The chain is too deep.
    TooDeep { hops: i64 },
    /// The chain has said enough.
    ChainFull { messages: i64 },
    /// The same message, again, too soon.
    Duplicate,
    /// Sending too fast.
    Cooldown { wait_ms: i64 },
    /// An agent cannot write to itself.
    Itself,
}

impl Refusal {
    /// The sentence shown in the transcript and the audit trail.
    pub fn message(&self) -> String {
        match self {
            Refusal::Paused => {
                "Agent messaging is paused for the whole app. Nothing was sent.".into()
            }
            Refusal::RecipientClosed { name } => {
                format!("{name} has not turned on agent messaging, so nothing was sent.")
            }
            Refusal::NotAllowed { name } => {
                format!("{name} is not on this agent's list of teammates it may write to.")
            }
            Refusal::TooDeep { hops } => format!(
                "This handoff is already {hops} deep. Vibyra stops at {MAX_HOPS} so agents \
                 cannot keep passing work sideways."
            ),
            Refusal::ChainFull { messages } => {
                format!("This chain has already carried {messages} messages, which is the limit.")
            }
            Refusal::Duplicate => {
                "That exact message was already sent moments ago, so it was not sent again.".into()
            }
            Refusal::Cooldown { wait_ms } => {
                format!(
                    "Too fast — messages are spaced at least {}s apart.",
                    wait_ms / 1000 + 1
                )
            }
            Refusal::Itself => "An agent cannot hand work to itself.".into(),
        }
    }
}

/// What the guards need to know about a proposed send.
pub struct SendContext<'a> {
    pub paused: bool,
    pub sender_id: &'a str,
    pub recipient_id: &'a str,
    pub recipient_name: &'a str,
    pub recipient_accepts: bool,
    pub allowed: bool,
    /// The hop this message would be — 1 for a first handoff.
    pub hop: i64,
    pub chain_messages: i64,
    /// Whether this exact body was sent by this sender inside the window.
    pub duplicate: bool,
    /// Milliseconds since this sender's last message, or `None` if it has
    /// never sent one.
    pub since_last_ms: Option<i64>,
}

/// The one gate. Returns `None` when the send may proceed.
///
/// Ordered cheapest and most absolute first, so the reason a user is shown is
/// the most fundamental one rather than whichever check happened to run.
pub fn refuse(context: &SendContext<'_>) -> Option<Refusal> {
    if context.paused {
        return Some(Refusal::Paused);
    }
    if context.sender_id == context.recipient_id {
        return Some(Refusal::Itself);
    }
    if !context.recipient_accepts {
        return Some(Refusal::RecipientClosed {
            name: context.recipient_name.to_string(),
        });
    }
    if !context.allowed {
        return Some(Refusal::NotAllowed {
            name: context.recipient_name.to_string(),
        });
    }
    if context.hop > MAX_HOPS {
        return Some(Refusal::TooDeep { hops: context.hop });
    }
    if context.chain_messages >= MAX_CHAIN_MESSAGES {
        return Some(Refusal::ChainFull {
            messages: context.chain_messages,
        });
    }
    if context.duplicate {
        return Some(Refusal::Duplicate);
    }
    match context.since_last_ms {
        Some(elapsed) if elapsed < COOLDOWN_MS => Some(Refusal::Cooldown {
            wait_ms: COOLDOWN_MS - elapsed,
        }),
        _ => None,
    }
}

/// Phrases that turn a handoff into an approval rather than an instruction.
///
/// A handoff is text written by one model and read by another, which makes it
/// the single most attractive place to smuggle "and also publish this". It
/// cannot widen the recipient's grants — that is enforced structurally, since
/// the recipient's turn is built from *its own* profile — but a request to do
/// something outward-facing should surface as a decision the user sees rather
/// than as a sentence buried in a chain.
const ESCALATION: &[&str] = &[
    "publish",
    "deploy",
    "merge",
    "push to main",
    "force push",
    "send the email",
    "post to",
    "refund",
    "charge",
    "delete the",
    "drop the table",
    "rotate the key",
    "grant yourself",
    "full access",
    "skip approval",
    "without asking",
];

/// Whether this handoff should land as an approval instead of a turn.
pub fn needs_approval(body: &str) -> Option<&'static str> {
    let lower = body.to_lowercase();
    ESCALATION
        .iter()
        .copied()
        .find(|phrase| lower.contains(phrase))
}

#[cfg(test)]
#[path = "guards_tests.rs"]
mod tests;
