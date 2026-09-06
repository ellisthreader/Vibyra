//! One question, one verdict.
//!
//! The path is the broker's: classify, refuse what no card may authorise,
//! allow what policy already allows, and otherwise raise a card and wait.
//! The waiting is the only part with a clock, and every way it can end is a
//! sentence Claude will read — "declined", "stopped", "nobody answered" —
//! never a silence it has to interpret.

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
    let subject = match context::load(world, &request.chat_id, &request.turn_id) {
        Ok(subject) => subject,
        Err(reason) => return BridgeReply::deny(reason),
    };
    if ["propose_memory", "propose_skill"].contains(&request.tool_name.as_str()) {
        return super::proposals::handle(world, &subject, &request);
    }
    let classified = approvals::classify(&request.tool_name, &request.input);

    if let Err(reason) =
        super::file_policy::check(&subject, &request.tool_name, &request.input, &classified)
    {
        return BridgeReply::deny(reason);
    }
    if classified.action == "file.write" {
        return BridgeReply::allow(request.input);
    }

    if classified.risk != approvals::Risk::Read
        && request.tool_use_id.as_deref().is_none_or(str::is_empty)
    {
        return BridgeReply::deny(
            "This provider request has no tool-call identity and cannot be approved.",
        );
    }
    let proposed = ProposedAction {
        agent_id: subject.agent_id.clone(),
        agent_name: subject.agent_name.clone(),
        chat_id: Some(request.chat_id.clone()),
        turn_id: Some(request.turn_id.clone()),
        risk: classified.risk,
        action: classified.action.clone(),
        target: classified.target.clone(),
        detail: format!(
            "{}\n\nExact request:\n{}",
            classified.detail,
            serde_json::json!({
                "toolUseId":request.tool_use_id,"tool":request.tool_name,"input":request.input,
                "contextFingerprint":subject.context_fingerprint,
            })
        ),
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
            if let Err(error) = vibyra_core::agent_runs::set_waiting(
                &world.db,
                &world.account,
                &request.turn_id,
                true,
            ) {
                return BridgeReply::deny(error.to_string());
            }
            raise(&card);
            let verdict = waiters::wait(world, &request.chat_id, &card.id, patience);
            if let Err(error) = vibyra_core::agent_runs::set_waiting(
                &world.db,
                &world.account,
                &request.turn_id,
                false,
            ) {
                return BridgeReply::deny(error.to_string());
            }
            match verdict {
                Verdict::Approved => match context::load(world, &request.chat_id, &request.turn_id)
                    .and_then(|current| {
                        super::file_policy::check(
                            &current,
                            &request.tool_name,
                            &request.input,
                            &classified,
                        )
                    }) {
                    Ok(()) => BridgeReply::allow(request.input),
                    Err(reason) => BridgeReply::deny(reason),
                },
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
