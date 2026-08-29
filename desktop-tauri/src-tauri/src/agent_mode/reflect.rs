//! Turning what just happened into something the agent remembers.
//!
//! Deliberately conservative, and deliberately not a second model call. An
//! extra round trip per turn to ask "what did you learn" doubles the cost of
//! every conversation to produce, most of the time, nothing — so the candidate
//! is drawn from what the agent already said, and `agent_memory::judge` decides
//! whether it may commit or has to wait for the user.
//!
//! An agent states a durable fact by writing it down plainly. The marker below
//! is documented in the brief the assembler injects, so the agent has a way to
//! say "this is worth keeping" that does not require guessing.

use vibyra_core::agent_memory::{judge, MemoryClass, NewMemory, Verdict};
use vibyra_core::agent_profiles::AgentProfile;
use vibyra_core::agentdb::AgentDb;

/// The line an agent writes when it wants something remembered.
const MARKER: &str = "REMEMBER:";

/// At most this many entries from one turn. A model that decides everything is
/// memorable must not be able to fill the ledger in one go.
const MAX_PER_TURN: usize = 3;

/// Extracts candidates from `text` and stores whatever reflection allows.
pub fn after_turn(db: &AgentDb, profile: &AgentProfile, chat_id: &str, turn_id: &str, text: &str) {
    for (class, body) in candidates(text) {
        let existing =
            vibyra_core::agent_memory::overlapping(db, &profile.id, &body).unwrap_or_default();
        let verdict = judge(profile.reflection, class, &body, &existing);
        let Some(status) = verdict.status() else {
            continue;
        };
        let _ = vibyra_core::agent_memory::record(
            db,
            &profile.id,
            NewMemory {
                class,
                body,
                // A proposal the user has to read ranks above an automatic
                // one, so the review list leads with what needed a person.
                priority: Some(match verdict {
                    Verdict::Proposed(_) => 60,
                    _ => 50,
                }),
                source_chat: Some(chat_id.to_string()),
                source_turn: Some(turn_id.to_string()),
            },
            status,
        );
    }
}

/// The lines an agent marked as worth keeping, with the class it named.
fn candidates(text: &str) -> Vec<(MemoryClass, String)> {
    text.lines()
        .filter_map(|line| {
            let rest = line.trim().strip_prefix(MARKER)?.trim();
            Some(classify(rest))
        })
        .filter(|(_, body)| body.chars().count() > 8)
        .take(MAX_PER_TURN)
        .collect()
}

/// Reads an optional `[class]` prefix, defaulting to a plain fact — the class
/// that commits most readily, and the one it is cheapest to be wrong about.
fn classify(text: &str) -> (MemoryClass, String) {
    let Some(rest) = text.strip_prefix('[') else {
        return (MemoryClass::Fact, text.to_string());
    };
    match rest.split_once(']') {
        Some((name, body)) => (MemoryClass::parse(name.trim()), body.trim().to_string()),
        None => (MemoryClass::Fact, text.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_marked_lines_are_candidates() {
        let text = "I read the file and changed it.\n\
                    REMEMBER: Release notes live in docs/releases.\n\
                    That should do it.";
        let found = candidates(text);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].1, "Release notes live in docs/releases.");
        assert_eq!(found[0].0, MemoryClass::Fact);
    }

    #[test]
    fn a_named_class_is_honoured() {
        let found = candidates("REMEMBER: [constraint] Never edit main directly.");
        assert_eq!(found[0].0, MemoryClass::Constraint);
        assert_eq!(found[0].1, "Never edit main directly.");
    }

    /// A model that decides everything is memorable must not fill the ledger
    /// in one turn.
    #[test]
    fn a_turn_can_only_contribute_so_much() {
        let text = (0..20)
            .map(|index| format!("REMEMBER: Fact number {index} about this codebase."))
            .collect::<Vec<_>>()
            .join("\n");
        assert_eq!(candidates(&text).len(), MAX_PER_TURN);
    }

    #[test]
    fn a_marker_with_nothing_useful_after_it_is_dropped() {
        assert!(candidates("REMEMBER: ok").is_empty());
        assert!(candidates("REMEMBER:").is_empty());
    }
}
