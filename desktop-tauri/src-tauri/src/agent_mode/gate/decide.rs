//! One question, one verdict.
//!
//! The path is the broker's: classify, refuse what no card may authorise,
//! allow what policy already allows, and otherwise raise a card and wait.
//! The waiting is the only part with a clock, and every way it can end is a
//! sentence Claude will read — "declined", "stopped", "nobody answered" —
//! never a silence it has to interpret.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use vibyra_core::approvals::{self, ApprovalRequest, Outcome, ProposedAction};

use super::context;
use super::waiters::{self, Verdict};
use crate::agent_mode::bridge::wire::{BridgeReply, BridgeRequest};
use crate::agent_mode::hub::AgentWorld;

/// How long a card may wait for a person before the provider is told no.
pub const PATIENCE: Duration = Duration::from_secs(30 * 60);

/// Answers a bridge question. `raise` is told about a card the moment it
/// exists, so the app can show it; `patience` bounds the wait.
pub fn answer(
    world: &Arc<AgentWorld>,
    expected_token: &str,
    request: BridgeRequest,
    raise: &dyn Fn(&ApprovalRequest),
    patience: Duration,
) -> BridgeReply {
    if !same_token(&request.token, expected_token) {
        return BridgeReply::deny("This question did not come from a turn Vibyra started.");
    }
    let subject = match context::load(world, &request.chat_id) {
        Ok(subject) => subject,
        Err(reason) => return BridgeReply::deny(reason),
    };
    let classified = approvals::classify(&request.tool_name, &request.input);

    // A file write is judged against the grants, not against a person. Both
    // answers were already given when the places were chosen: inside a
    // writable grant it proceeds, outside every grant it is refused. Asking
    // here instead would put a card on screen for every edit of a folder the
    // user handed over on purpose, which is how people learn to click yes.
    //
    // A subject that may not write — a Plan-level teammate, or a Chat Mode
    // chat with no folder mounted — is refused a write before anyone is
    // asked. Raising a card instead would let one Approve put a file
    // anywhere on disk, which is more than a chat *with* a grant may do.
    if classified.action == "file.write" && !subject.writes {
        return BridgeReply::deny(
            "This chat has no folder it may write to. Grant one, or ask for a plan instead.",
        );
    }
    if classified.action == "file.write" {
        return match vibyra_core::agent_profiles::authorize(
            &subject.places,
            Path::new(&classified.target),
            true,
        ) {
            Ok(_) => BridgeReply::allow(request.input),
            Err(error) => BridgeReply::deny(error.to_string()),
        };
    }

    let proposed = ProposedAction {
        agent_id: subject.agent_id.clone(),
        agent_name: subject.agent_name.clone(),
        chat_id: Some(request.chat_id.clone()),
        turn_id: Some(request.turn_id.clone()),
        risk: classified.risk,
        action: classified.action,
        target: classified.target,
        detail: classified.detail,
        cost_usd: None,
    };
    let outcome = match approvals::request(&world.db, &world.account, proposed, subject.writes) {
        Ok(outcome) => outcome,
        Err(error) => return BridgeReply::deny(error.to_string()),
    };
    match outcome {
        Outcome::Allowed => BridgeReply::allow(request.input),
        Outcome::Forbidden(reason) => BridgeReply::deny(reason),
        Outcome::Pending(card) => {
            raise(&card);
            match waiters::wait(world, &request.chat_id, &card.id, patience) {
                Verdict::Approved => BridgeReply::allow(request.input),
                Verdict::Denied => BridgeReply::deny(
                    "The person running Vibyra declined this. Do not retry it; explain what \
                     you would have done and continue without it.",
                ),
                Verdict::Cancelled => BridgeReply::deny("Stopped by the user."),
                Verdict::TimedOut => {
                    let _ = approvals::expire(&world.db, &world.account, &card.id);
                    BridgeReply::deny(
                        "Nobody answered in time, so this was not allowed. Explain what you \
                         needed and stop here.",
                    )
                }
            }
        }
    }
}

/// Equal without short-circuiting on the first differing byte. The caller is
/// an unauthenticated local socket that can retry without limit, so the
/// comparison must not tell it how much of a guess was right.
fn same_token(given: &str, expected: &str) -> bool {
    let (given, expected) = (given.as_bytes(), expected.as_bytes());
    if given.len() != expected.len() {
        return false;
    }
    given
        .iter()
        .zip(expected)
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}
