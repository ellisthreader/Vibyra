//! What needs asking, and what never gets asked because it is never allowed.
//!
//! One table, in one file, consulted by everything. UI components do not
//! decide authorisation — they render what this decided — because a rule that
//! lives in a button is a rule that is missing from the next button.
//!
//! The distinction the whole design turns on: **trust can be granted for a
//! class of action inside a place, never for an effect that leaves the
//! machine.** A user can reasonably say "yes, this agent may edit files in
//! this folder without asking every time". Nobody can usefully say "yes, this
//! agent may send email without asking every time", because the next email is
//! not the one they were shown.

use serde::{Deserialize, Serialize};

/// What kind of consequence an action has.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Risk {
    /// Reading inside a granted place, navigating, refreshing, drafting.
    Read,
    /// Writing inside a granted place.
    Write,
    /// Removing something of the user's, locally.
    Destructive,
    /// Money.
    Spend,
    /// Anything that leaves the machine under the user's name — sending,
    /// posting, merging, opening a pull request.
    Publish,
    /// Revealing a credential, or widening what the agent may reach.
    Secret,
}

impl Risk {
    pub fn as_str(self) -> &'static str {
        match self {
            Risk::Read => "read",
            Risk::Write => "write",
            Risk::Destructive => "destructive",
            Risk::Spend => "spend",
            Risk::Publish => "publish",
            Risk::Secret => "secret",
        }
    }

    /// Unknown reads as `Secret` — the class that always asks and can never be
    /// trusted away. An unrecognised risk is the one most worth stopping.
    pub fn parse(value: &str) -> Self {
        match value {
            "read" => Risk::Read,
            "write" => Risk::Write,
            "destructive" => Risk::Destructive,
            "spend" => Risk::Spend,
            "publish" => Risk::Publish,
            _ => Risk::Secret,
        }
    }
}

/// What the broker decided about one proposed action.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Decision {
    /// Proceed without asking.
    Allowed,
    /// Ask, and offer to remember the answer for this class in this place.
    AskTrustable,
    /// Ask, every single time, and do not offer to remember.
    AskAlways,
}

/// The policy table.
///
/// `writes` is whether the agent's permission level allows writing at all —
/// a Plan-mode agent's proposed write is refused before anyone is asked,
/// which is what makes Plan mode meaningful rather than advisory.
pub fn decide(risk: Risk, writes: bool) -> Decision {
    match risk {
        Risk::Read => Decision::Allowed,
        Risk::Write if writes => Decision::AskTrustable,
        // A write proposed by an agent that may not write. Still asked rather
        // than silently dropped, so the user sees what it wanted to do — but
        // never trustable, because the standing answer is already "no".
        Risk::Write => Decision::AskAlways,
        Risk::Destructive | Risk::Spend | Risk::Publish | Risk::Secret => Decision::AskAlways,
    }
}

/// Whether an approval of this risk may be remembered for later actions of
/// the same shape.
pub fn trustable(risk: Risk, writes: bool) -> bool {
    decide(risk, writes) == Decision::AskTrustable
}

/// Things no approval can authorise, whatever the user clicks.
///
/// These are not "ask first" — they are refusals. A prompt asking for one is a
/// prompt-injection attempt or a bug, and either way the honest answer is that
/// Vibyra does not do it. Kept as a list so the reason is greppable from the
/// message the user sees.
pub const NEVER: &[(&str, &str)] = &[
    (
        "reveal-credential",
        "Vibyra never puts a stored credential into a prompt or a transcript. \
         The plugin gateway uses it on the agent's behalf instead.",
    ),
    (
        "expand-permission",
        "An agent cannot widen its own places, plugins or permission level. \
         Change it in the agent's settings.",
    ),
    (
        "bypass-sandbox",
        "Vibyra does not run a provider with its approvals and sandbox switched off.",
    ),
];

/// Whether this action is refused outright, and why.
pub fn forbidden(action: &str) -> Option<&'static str> {
    NEVER
        .iter()
        .find(|(name, _)| *name == action)
        .map(|(_, reason)| *reason)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reading inside a place someone already granted is the work, not a
    /// question. A rule that asks about it teaches people to click yes.
    #[test]
    fn reading_inside_a_granted_place_is_not_a_question() {
        assert_eq!(decide(Risk::Read, true), Decision::Allowed);
        assert_eq!(decide(Risk::Read, false), Decision::Allowed);
    }

    /// The line the design turns on: a class of local write can be trusted
    /// away; nothing that leaves the machine ever can.
    #[test]
    fn only_local_writes_can_be_trusted_away() {
        assert!(trustable(Risk::Write, true));
        for outward in [Risk::Publish, Risk::Spend, Risk::Secret, Risk::Destructive] {
            assert!(
                !trustable(outward, true),
                "{outward:?} offered a standing yes"
            );
            assert_eq!(decide(outward, true), Decision::AskAlways);
        }
    }

    /// Plan mode is a boundary, not advice: a write proposed there can never
    /// become a standing permission.
    #[test]
    fn a_plan_mode_agent_is_never_offered_a_standing_write() {
        assert_eq!(decide(Risk::Write, false), Decision::AskAlways);
        assert!(!trustable(Risk::Write, false));
    }

    /// An unrecognised risk is the one most worth stopping.
    #[test]
    fn an_unknown_risk_reads_as_the_strictest_one() {
        assert_eq!(Risk::parse("something-new"), Risk::Secret);
        assert_eq!(
            decide(Risk::parse("something-new"), true),
            Decision::AskAlways
        );
    }

    /// Some things are refusals, not questions — and each says why.
    #[test]
    fn forbidden_actions_explain_themselves_rather_than_prompting() {
        assert!(forbidden("reveal-credential")
            .is_some_and(|why| why.contains("keyring") || why.contains("plugin gateway")));
        assert!(forbidden("expand-permission").is_some());
        assert!(forbidden("write-a-file").is_none());
    }
}
