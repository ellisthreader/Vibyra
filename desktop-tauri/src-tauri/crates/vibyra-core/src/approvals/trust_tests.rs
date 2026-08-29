//! Who may be offered "don't ask again".
//!
//! Split out because all three are about one property that was wrong once:
//! `trustable` is read from the agent's permission *as it stands now*, on
//! every read, and a hardcoded "may write" quietly offered a standing yes for
//! a write a Plan-mode agent could never perform.

use super::*;
use crate::agentdb::AgentDb;

fn proposed(action: &str, risk: Risk) -> ProposedAction {
    ProposedAction {
        agent_id: Some("a".into()),
        agent_name: "Nia".into(),
        chat_id: Some("c".into()),
        turn_id: Some("t".into()),
        risk,
        action: action.into(),
        target: "/w/project/notes.md".into(),
        detail: "Write the release notes.".into(),
        cost_usd: None,
    }
}

fn seeded() -> AgentDb {
    let db = AgentDb::open_memory().unwrap();
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO agent_profiles \
                 (id, account, name, engine, home_path, permission, created_ms, updated_ms) \
                 VALUES ('a', 'acct', 'Nia', 'claude', '/tmp/a', 'standard', 1, 1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_chats (id, account, agent_id, engine, created_ms, updated_ms) \
                 VALUES ('c', 'acct', 'a', 'claude', 1, 1)",
                [],
            )
            .unwrap();
        Ok(())
    })
    .unwrap();
    db
}

/// The bug this exists for: `pending()` used to report `trustable` from a
/// hardcoded "this agent may write", so a write proposed by a **Plan-mode**
/// agent came back offering "don't ask again" — the exact standing yes
/// `risk::decide` refuses to grant. It is read from the agent's real
/// permission now, on every read.
#[test]
fn a_plan_mode_agents_write_is_never_offered_a_standing_yes_on_read() {
    let db = seeded();
    db.with(|connection| {
        connection
            .execute(
                "UPDATE agent_profiles SET permission = 'plan' WHERE id = 'a'",
                [],
            )
            .unwrap();
        Ok(())
    })
    .unwrap();

    // `writes: false` is what the runtime passes for a Plan-mode turn.
    let Outcome::Pending(card) =
        request(&db, "acct", proposed("fs.write", Risk::Write), false).unwrap()
    else {
        panic!("a write must still be shown, even when it cannot be granted");
    };
    assert!(
        !card.trustable,
        "the broker offered a standing yes at creation"
    );

    let listed = pending(&db, "acct").unwrap();
    assert_eq!(listed.len(), 1);
    assert!(
        !listed[0].trustable,
        "reading the card back offered a standing yes the policy refuses"
    );
}

/// And the ordinary case still works, so the fix is not simply "never
/// trustable".
#[test]
fn a_standard_agents_write_may_still_be_trusted_away() {
    let db = seeded();
    let Outcome::Pending(_) =
        request(&db, "acct", proposed("fs.write", Risk::Write), true).unwrap()
    else {
        panic!()
    };
    assert!(pending(&db, "acct").unwrap()[0].trustable);
}

/// A card outlives the agent that raised it, and an agent that is gone holds
/// no permission — so its cards can never be trusted away.
#[test]
fn a_card_whose_agent_was_deleted_is_readable_but_never_trustable() {
    let db = seeded();
    request(&db, "acct", proposed("fs.write", Risk::Write), true).unwrap();
    db.with(|connection| {
        connection
            .execute("DELETE FROM agent_profiles WHERE id = 'a'", [])
            .unwrap();
        Ok(())
    })
    .unwrap();

    let listed = pending(&db, "acct").unwrap();
    assert_eq!(listed.len(), 1, "the ledger must survive the agent");
    assert_eq!(listed[0].agent_name, "Nia");
    assert!(!listed[0].trustable);
}
