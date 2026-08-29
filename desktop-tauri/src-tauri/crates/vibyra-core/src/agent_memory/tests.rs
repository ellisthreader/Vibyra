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

/// Approved memory is the point: it has to reach a chat that did not exist
/// when it was learned.
#[test]
fn approved_memory_is_what_a_later_turn_sees() {
    let db = seeded();
    add(
        &db,
        MemoryClass::Fact,
        "Release notes live in docs/releases.",
        MemoryStatus::Active,
    );
    let waiting = add(
        &db,
        MemoryClass::Fact,
        "Deploys are manual.",
        MemoryStatus::Proposed,
    );

    let injected = within_budget(&db, "a", 4_000).unwrap();
    assert_eq!(injected.len(), 1, "a proposal is stored, not injected");

    set_status(&db, &waiting.id, MemoryStatus::Active).unwrap();
    assert_eq!(within_budget(&db, "a", 4_000).unwrap().len(), 2);
}

/// The budget shapes the prompt, never the store. This is the difference
/// between "too much context" and "my agent forgot".
#[test]
fn the_budget_ranks_entries_out_without_losing_them() {
    let db = seeded();
    for index in 0..20 {
        add(
            &db,
            MemoryClass::Fact,
            &format!("Fact number {index} about the codebase."),
            MemoryStatus::Active,
        );
    }
    let injected = within_budget(&db, "a", 120).unwrap();
    assert!(injected.len() < 5, "the budget was not enforced");
    assert_eq!(list(&db, "a").unwrap().len(), 20, "nothing was deleted");
}

/// A pinned entry is the user's override on the budget.
#[test]
fn a_pinned_entry_is_never_ranked_out() {
    let db = seeded();
    let pinned = add(
        &db,
        MemoryClass::Fact,
        "Never force-push the release branch.",
        MemoryStatus::Active,
    );
    amend(&db, &pinned.id, None, None, Some(true)).unwrap();
    for index in 0..20 {
        add(
            &db,
            MemoryClass::Fact,
            &format!("Filler {index}."),
            MemoryStatus::Active,
        );
    }

    let injected = within_budget(&db, "a", 40).unwrap();
    assert!(injected.iter().any(|entry| entry.id == pinned.id));
    assert_eq!(injected[0].id, pinned.id, "pinned entries lead");
}

/// Being wrong about a constraint costs more than being wrong about a fact,
/// so it outranks one when the budget is tight.
#[test]
fn a_constraint_outranks_a_fact_under_pressure() {
    let db = seeded();
    add(
        &db,
        MemoryClass::Fact,
        "Tests live in tests/.",
        MemoryStatus::Active,
    );
    add(
        &db,
        MemoryClass::Constraint,
        "Never edit main directly.",
        MemoryStatus::Active,
    );

    let injected = within_budget(&db, "a", 30).unwrap();
    assert_eq!(injected.len(), 1);
    assert_eq!(injected[0].class, MemoryClass::Constraint);
}
