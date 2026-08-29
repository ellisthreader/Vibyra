//! Chat Mode and search.
//!
//! The promise under test: a chat with no teammate can reach nothing of the
//! user's until they explicitly mount a folder, and the moment they do, the
//! composer has to stop claiming otherwise.

use super::*;
use crate::agent_model::{ChatSource, Engine};
use crate::agent_runtime::AgentEvent;
use crate::agentdb::AgentDb;

fn seeded() -> (AgentDb, String) {
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
        Ok(())
    })
    .unwrap();
    (db, "a".into())
}

fn open(db: &AgentDb, agent: Option<&str>) -> AgentChat {
    create(
        db,
        "acct",
        NewChat {
            agent_id: agent.map(str::to_string),
            engine: Engine::Claude,
            title: String::new(),
            source: ChatSource::User,
        },
    )
    .unwrap()
}

/// Chat Mode is the same table with no teammate, and it must have no reach
/// until the user explicitly gives it one.
#[test]
fn a_detached_chat_has_no_reach_until_a_place_is_mounted() {
    let tmp = tempfile::tempdir().unwrap();
    let (db, agent) = seeded();
    let detached = open(&db, None);
    assert!(detached.detached());

    mount_place(&db, "acct", &detached.id, tmp.path().to_str()).unwrap();
    let mounted = get(&db, "acct", &detached.id).unwrap();
    assert!(
        !mounted.detached(),
        "the composer must stop claiming detachment"
    );
    assert!(mounted.mounted_place.is_some());

    // And the two lists stay separate: an agent's chats are not Chat Mode's.
    assert_eq!(list(&db, "acct", None).unwrap().len(), 1);
    assert_eq!(list(&db, "acct", Some(&agent)).unwrap().len(), 0);
}

/// Search reads what was actually said, not just the titles, because a chat
/// that was never renamed is the common case.
#[test]
fn search_finds_a_chat_by_something_said_inside_it() {
    let (db, agent) = seeded();
    let chat = open(&db, Some(&agent));
    transcript::append(
        &db,
        &chat.id,
        "t1",
        AgentEvent::AssistantCompleted {
            text: "the migration rehearsal passed".into(),
        },
    )
    .unwrap();

    let hits = search(&db, "acct", "rehearsal").unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, chat.id);
    assert!(search(&db, "acct", "nothing like this").unwrap().is_empty());
    assert!(
        search(&db, "acct", "a").unwrap().is_empty(),
        "too short to be a search"
    );
}

/// One unreadable row must not make a whole conversation unopenable.
#[test]
fn a_corrupt_event_row_is_skipped_not_fatal() {
    let (db, agent) = seeded();
    let chat = open(&db, Some(&agent));
    transcript::append(
        &db,
        &chat.id,
        "t1",
        AgentEvent::AssistantCompleted {
            text: "kept".into(),
        },
    )
    .unwrap();
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO chat_events (chat_id, turn_id, seq, kind, payload, created_ms) \
                 VALUES (?1, 't1', 99, 'assistant.completed', 'this is not json', 1)",
                rusqlite::params![chat.id],
            )
            .unwrap();
        Ok(())
    })
    .unwrap();

    let rows = transcript::recent(&db, &chat.id).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].seq, 0);
}
