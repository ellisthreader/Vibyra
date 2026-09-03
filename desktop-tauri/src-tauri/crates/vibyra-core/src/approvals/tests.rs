use super::*;
use crate::agentdb::AgentDb;

pub(super) fn proposed(action: &str, risk: Risk) -> ProposedAction {
    ProposedAction {
        agent_id: Some("a".into()),
        agent_name: "Nia".into(),
        chat_id: Some("c".into()),
        turn_id: Some("t".into()),
        risk,
        action: action.into(),
        target: "vibyra/vibyra#412".into(),
        detail: "Post a comment saying the release is cut.".into(),
        cost_usd: None,
    }
}

pub(super) fn seeded() -> AgentDb {
    let db = AgentDb::open_memory().unwrap();
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO agent_profiles \
                 (id, account, name, engine, home_path, created_ms, updated_ms) \
                 VALUES ('a', 'acct', 'Nia', 'claude', '/tmp/a', 1, 1)",
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

/// A read inside a granted place proceeds without a card, and a publish never
/// does. This is the whole policy in one test.
#[test]
fn reads_pass_and_publishes_stop() {
    let db = seeded();
    assert!(matches!(
        request(&db, "acct", proposed("fs.read", Risk::Read), true).unwrap(),
        Outcome::Allowed
    ));
    assert!(matches!(
        request(&db, "acct", proposed("github.comment", Risk::Publish), true).unwrap(),
        Outcome::Pending(_)
    ));
    assert_eq!(pending(&db, "acct").unwrap().len(), 1);
}

/// The card is the contract: what the user reads is what is stored, and it is
/// the stored row an executor acts on.
#[test]
fn the_approved_row_carries_the_exact_effect() {
    let db = seeded();
    let Outcome::Pending(card) =
        request(&db, "acct", proposed("github.comment", Risk::Publish), true).unwrap()
    else {
        panic!("a publish must raise a card");
    };
    let resolved = resolve(&db, "acct", &card.id, true, Some(&card.fingerprint)).unwrap();

    assert_eq!(resolved.state, "approved");
    assert_eq!(resolved.detail, "Post a comment saying the release is cut.");
    assert_eq!(resolved.target, "vibyra/vibyra#412");
    assert!(pending(&db, "acct").unwrap().is_empty());
}

/// If the action moves underneath the card, approving it authorises nothing —
/// and the card says invalidated rather than quietly doing nothing.
#[test]
fn a_changed_payload_invalidates_the_card_instead_of_approving_it() {
    let db = seeded();
    let Outcome::Pending(card) =
        request(&db, "acct", proposed("stripe.refund", Risk::Spend), true).unwrap()
    else {
        panic!("a spend must raise a card");
    };

    let resolved = resolve(&db, "acct", &card.id, true, Some("a-different-digest")).unwrap();
    assert_eq!(resolved.state, "invalidated");
    assert_ne!(resolved.state, "approved");
}

/// A decision is answered once. A second answer is an error, not a re-run.
#[test]
fn a_card_cannot_be_answered_twice() {
    let db = seeded();
    let Outcome::Pending(card) =
        request(&db, "acct", proposed("fs.delete", Risk::Destructive), true).unwrap()
    else {
        panic!("a destructive action must raise a card");
    };
    resolve(&db, "acct", &card.id, false, None).unwrap();
    assert!(resolve(&db, "acct", &card.id, true, None).is_err());
}

/// A card that outlives its turn is how a stale yes authorises something
/// nobody is watching.
#[test]
fn cancelling_a_turn_kills_the_questions_it_raised() {
    let db = seeded();
    request(&db, "acct", proposed("github.comment", Risk::Publish), true).unwrap();
    request(&db, "acct", proposed("stripe.refund", Risk::Spend), true).unwrap();
    assert_eq!(pending(&db, "acct").unwrap().len(), 2);

    assert_eq!(invalidate_turn(&db, "t").unwrap(), 2);
    assert!(pending(&db, "acct").unwrap().is_empty());
}

/// Some requests are refused rather than asked. A prompt-injection asking for
/// a credential gets an explanation, not a dialog with a yes button.
#[test]
fn a_forbidden_action_is_refused_rather_than_put_to_the_user() {
    let db = seeded();
    let outcome = request(
        &db,
        "acct",
        proposed("reveal-credential", Risk::Secret),
        true,
    )
    .unwrap();

    match outcome {
        Outcome::Forbidden(reason) => assert!(reason.contains("never"), "{reason}"),
        _ => panic!("a forbidden action must not become a question"),
    }
    assert!(
        pending(&db, "acct").unwrap().is_empty(),
        "and it raises no card"
    );
}

/// Approvals outlive the agent that asked for them: the ledger has to stay
/// readable after a teammate is deleted.
#[test]
fn the_ledger_survives_the_agent_being_deleted() {
    let db = seeded();
    let Outcome::Pending(card) =
        request(&db, "acct", proposed("github.comment", Risk::Publish), true).unwrap()
    else {
        panic!()
    };
    resolve(&db, "acct", &card.id, true, None).unwrap();

    db.with(|connection| {
        connection
            .execute("DELETE FROM agent_profiles WHERE id = 'a'", [])
            .unwrap();
        // The chat cascaded with the agent; the ledger row did not.
        let (name, state): (String, String) = connection
            .query_row(
                "SELECT agent_name, state FROM approval_requests WHERE id = ?1",
                rusqlite::params![card.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!((name.as_str(), state.as_str()), ("Nia", "approved"));
        Ok(())
    })
    .unwrap();
}

/// The account boundary holds here too.
#[test]
fn another_account_cannot_answer_a_card() {
    let db = seeded();
    let Outcome::Pending(card) =
        request(&db, "acct", proposed("github.comment", Risk::Publish), true).unwrap()
    else {
        panic!()
    };
    assert!(resolve(&db, "someone-else", &card.id, true, None).is_err());
    assert!(pending(&db, "someone-else").unwrap().is_empty());
}
