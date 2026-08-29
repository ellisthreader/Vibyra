//! Storing and correcting entries.
//!
//! The two properties here are the ones that make memory trustworthy rather
//! than merely present: nothing credential-shaped can be stored by any route,
//! and correcting an entry keeps the provenance that says where it came from.

use super::*;
use crate::agentdb::AgentDb;

fn seeded() -> AgentDb {
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
    db
}

fn add(db: &AgentDb, class: MemoryClass, body: &str, status: MemoryStatus) -> MemoryEntry {
    record(
        db,
        "a",
        NewMemory {
            class,
            body: body.into(),
            priority: None,
            source_chat: Some("c1".into()),
            source_turn: Some("t1".into()),
        },
        status,
    )
    .unwrap()
}

/// Every path to a stored row passes the secret check, including a user
/// typing one in and a later edit.
#[test]
fn a_credential_is_refused_however_it_arrives() {
    let db = seeded();
    let typed = record(
        &db,
        "a",
        NewMemory {
            class: MemoryClass::Fact,
            body: "the api key = sk-proj-AbCdEfGhIjKlMnOpQrStUv".into(),
            priority: None,
            source_chat: None,
            source_turn: None,
        },
        MemoryStatus::Active,
    );
    assert!(typed.is_err());

    let clean = add(
        &db,
        MemoryClass::Fact,
        "The key lives in the keyring.",
        MemoryStatus::Active,
    );
    let edited = amend(
        &db,
        &clean.id,
        Some("password: hunter2andthensome"),
        None,
        None,
    );
    assert!(
        edited.is_err(),
        "an edit must not smuggle one past the check"
    );
}

/// Provenance survives correction — "where did this come from" still answers
/// after the text has been fixed, which is why editing is not delete-and-add.
#[test]
fn correcting_an_entry_keeps_where_it_came_from() {
    let db = seeded();
    let entry = add(
        &db,
        MemoryClass::Fact,
        "Deploys run from ship.sh.",
        MemoryStatus::Active,
    );
    amend(
        &db,
        &entry.id,
        Some("Deploys run from scripts/ship.sh."),
        Some(80),
        None,
    )
    .unwrap();

    let stored = list(&db, "a").unwrap().into_iter().next().unwrap();
    assert_eq!(stored.body, "Deploys run from scripts/ship.sh.");
    assert_eq!(stored.priority, 80);
    assert_eq!(stored.source_chat.as_deref(), Some("c1"));
    assert_eq!(stored.created_ms, entry.created_ms);
}

/// Reflection asks the store what it already knows before it commits, and
/// that lookup is the contradiction guard's only input.
#[test]
fn overlapping_finds_what_a_proposal_would_contradict() {
    let db = seeded();
    add(
        &db,
        MemoryClass::Fact,
        "Deploys run from scripts/ship.sh.",
        MemoryStatus::Active,
    );
    add(
        &db,
        MemoryClass::Fact,
        "The design tokens live in tokens.css.",
        MemoryStatus::Active,
    );

    let clashes = overlapping(&db, "a", "Deploys now run from scripts/deploy.sh.").unwrap();
    assert_eq!(clashes.len(), 1);
    assert!(clashes[0].body.contains("ship.sh"));
}
