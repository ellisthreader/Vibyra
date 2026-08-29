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

/// The ordinary case, and the audit row both ends can read.
#[test]
fn an_allowed_handoff_is_delivered_and_recorded_for_both_agents() {
    let db = seeded();
    let outcome = send(
        &db,
        false,
        handoff("a", "b", "Look at parser.rs", None),
        "Rae",
        true,
    )
    .unwrap();
    let Delivery::Delivered(message) = outcome else {
        panic!("an allowed handoff must land");
    };

    assert_eq!(message.hop, 1);
    // The fresh chat the handoff woke the recipient into.
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO agent_chats (id, account, agent_id, engine, source, created_ms, \
                 updated_ms) VALUES ('chat-1', 'acct', 'b', 'claude', 'handoff', 1, 1)",
                [],
            )
            .unwrap();
        Ok(())
    })
    .unwrap();
    attach_chat(&db, &message.id, "chat-1").unwrap();
    assert_eq!(trail(&db, "a", 10).unwrap().len(), 1, "the sender sees it");
    assert_eq!(
        trail(&db, "b", 10).unwrap().len(),
        1,
        "and so does the recipient"
    );
    assert_eq!(
        trail(&db, "b", 10).unwrap()[0].chat_id.as_deref(),
        Some("chat-1")
    );
}

/// An agent not on the list cannot be reached, even with messaging on.
/// Enabling messaging says an agent may be spoken to; the list says by whom.
#[test]
fn the_allowlist_is_separate_from_being_reachable_at_all() {
    let db = seeded();
    let blocked = send(
        &db,
        false,
        handoff("a", "c", "Take this", None),
        "Sol",
        true,
    )
    .unwrap();
    assert!(matches!(
        blocked,
        Delivery::Refused(Refusal::NotAllowed { .. })
    ));

    let closed = send(
        &db,
        false,
        handoff("a", "b", "Take this", None),
        "Rae",
        false,
    )
    .unwrap();
    assert!(matches!(
        closed,
        Delivery::Refused(Refusal::RecipientClosed { .. })
    ));
}

/// A refusal is stored, not dropped — otherwise "why did nothing happen" has
/// nothing to read.
#[test]
fn a_refused_message_still_appears_in_the_audit_trail() {
    let db = seeded();
    send(&db, true, handoff("a", "b", "Take this", None), "Rae", true).unwrap();
    let trail = trail(&db, "a", 10).unwrap();
    assert_eq!(trail.len(), 1);
    assert_eq!(trail[0].status, "refused");
}

/// Two agents that can wake each other are a loop. The chain terminates.
#[test]
fn a_chain_stops_at_the_hop_limit() {
    let db = seeded();
    set_allowlist(&db, "b", &["a".into(), "c".into()]).unwrap();

    let mut parent: Option<String> = None;
    let mut hop = 0;
    for step in 0..(MAX_HOPS + 3) {
        let (from, to, name) = if step % 2 == 0 {
            ("a", "b", "Rae")
        } else {
            ("b", "a", "Nia")
        };
        let body = format!("pass it back, round {step}");
        let outcome = send(
            &db,
            false,
            handoff(from, to, &body, parent.as_deref()),
            name,
            true,
        );
        match outcome.unwrap() {
            Delivery::Delivered(message) => {
                hop = message.hop;
                parent = Some(message.id);
            }
            Delivery::Refused(Refusal::TooDeep { .. } | Refusal::Cooldown { .. }) => break,
            other => panic!(
                "unexpected outcome at step {step}: {}",
                matches!(other, Delivery::Refused(_))
            ),
        }
    }
    assert!(hop <= MAX_HOPS, "the chain reached hop {hop}");
}
