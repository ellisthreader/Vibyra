//! What happens to a message that is allowed, repeated, or asking too much.

use super::*;
use crate::agentdb::AgentDb;

fn seeded() -> AgentDb {
    let db = AgentDb::open_memory().unwrap();
    db.with(|connection| {
        for (id, name) in [("a", "Nia"), ("b", "Rae"), ("c", "Sol")] {
            connection
                .execute(
                    "INSERT INTO agent_profiles \
                     (id, account, name, engine, home_path, mail_enabled, created_ms, updated_ms) \
                     VALUES (?1, 'acct', ?2, 'claude', '/tmp/a', 1, 1, 1)",
                    rusqlite::params![id, name],
                )
                .unwrap();
        }
        Ok(())
    })
    .unwrap();
    set_allowlist(&db, "a", &["b".into()]).unwrap();
    set_allowlist(&db, "b", &["c".into()]).unwrap();
    db
}

fn handoff(from: &str, to: &str, body: &str, parent: Option<&str>) -> Handoff {
    Handoff {
        sender_id: from.into(),
        sender_name: if from == "a" {
            "Nia".into()
        } else {
            "Rae".into()
        },
        recipient_id: to.into(),
        body: body.into(),
        parent_id: parent.map(str::to_string),
    }
}

/// The same message twice in a row is one message.
#[test]
fn an_identical_message_is_not_sent_twice() {
    let db = seeded();
    send(
        &db,
        false,
        handoff("a", "b", "Same thing", None),
        "Rae",
        true,
    )
    .unwrap();
    let again = send(
        &db,
        false,
        handoff("a", "b", "same THING", None),
        "Rae",
        true,
    )
    .unwrap();
    assert!(matches!(
        again,
        Delivery::Refused(Refusal::Duplicate | Refusal::Cooldown { .. })
    ));
}

/// A handoff asking for an outward effect lands as a decision the user sees,
/// not as a turn that quietly runs.
#[test]
fn a_handoff_asking_to_publish_becomes_a_decision() {
    let db = seeded();
    let outcome = send(
        &db,
        false,
        handoff("a", "b", "Finish the notes and publish the release.", None),
        "Rae",
        true,
    )
    .unwrap();

    let Delivery::NeedsApproval { message, phrase } = outcome else {
        panic!("an outward-facing handoff must not deliver silently");
    };
    assert_eq!(phrase, "publish");
    assert_eq!(message.status, "awaitingApproval");
}

/// Replacing the list is one call, so removing a teammate cannot half-apply.
#[test]
fn the_allowlist_is_replaced_wholesale() {
    let db = seeded();
    set_allowlist(&db, "a", &["b".into(), "c".into()]).unwrap();
    assert_eq!(allowlist(&db, "a").unwrap().len(), 2);

    set_allowlist(&db, "a", &[]).unwrap();
    assert!(allowlist(&db, "a").unwrap().is_empty());
    let blocked = send(&db, false, handoff("a", "b", "anything", None), "Rae", true).unwrap();
    assert!(matches!(
        blocked,
        Delivery::Refused(Refusal::NotAllowed { .. })
    ));
}
