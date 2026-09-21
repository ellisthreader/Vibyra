use super::{publish, tests::setup};
use serde_json::json;
#[test]
fn failed_persistence_stops_control_before_dispatch() {
    let (_dir, engine, _) = setup();
    engine
        .shared
        .lock()
        .journal
        .connection
        .execute_batch("PRAGMA query_only=ON")
        .unwrap();
    assert!(publish(
        &mut engine.shared.lock(),
        "session",
        Some(json!({"id":"fail","kind":"message","text":"not sent"}))
    )
    .is_err());
    let state = engine.shared.lock();
    assert_eq!(state.sessions["session"].meta.status, "interrupted");
    assert!(state.sessions["session"].lease.is_none());
}

#[test]
fn legacy_snapshot_is_backed_up_and_migrates_into_indexed_history() {
    let (_dir, engine, _) = setup();
    let state = engine.shared.lock();
    let mut legacy = serde_json::to_value(&state.conversations["session"]).unwrap();
    legacy["items"] = json!([{"id":"legacy", "kind":"message", "text":"Retained old answer", "status":"completed", "order":1}]);
    legacy["cursor"] = json!(1);
    state
        .journal
        .connection
        .execute(
            "INSERT INTO conversations(id,data) VALUES('session',?1)",
            [legacy.to_string()],
        )
        .unwrap();
    state
        .journal
        .connection
        .execute_batch("DROP TABLE conversation_legacy_backup")
        .unwrap();
    let restored = state.journal.conversations().unwrap();
    assert_eq!(restored["session"].items[0]["text"], "Retained old answer");
    let backup: String = state
        .journal
        .connection
        .query_row(
            "SELECT data FROM conversation_legacy_backup WHERE id='session'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&backup).unwrap(),
        legacy
    );
    let again = state.journal.conversations().unwrap();
    assert_eq!(again["session"].items[0]["id"], "legacy");
}
#[test]
fn corrupt_snapshot_fails_without_overwriting_original_data() {
    let (_dir, engine, _) = setup();
    let state = engine.shared.lock();
    state
        .journal
        .connection
        .execute(
            "INSERT INTO conversations(id,data) VALUES('corrupt','broken JSON')",
            [],
        )
        .unwrap();
    assert!(state.journal.conversations().is_err());
    let retained: String = state
        .journal
        .connection
        .query_row(
            "SELECT data FROM conversations WHERE id='corrupt'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(retained, "broken JSON");
}
