use super::*;

/// A fresh file lands on the current schema, with the pragmas the cascade
/// rules depend on actually on — `foreign_keys` is per-connection and off by
/// default, so the schema's `ON DELETE CASCADE` is prose until this passes.
#[test]
fn creates_and_configures_a_fresh_database() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("nested").join("agents.db");
    let db = AgentDb::open(&path).unwrap();

    db.with(|connection| {
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, schema::target_version());
        let foreign_keys: i64 = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);
        let journal: String = connection
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        assert_eq!(journal.to_lowercase(), "wal");
        Ok(())
    })
    .unwrap();
}

/// Opening twice must be a no-op the second time, not a re-run of migration 1
/// against tables that already exist.
#[test]
fn reopening_is_idempotent() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("agents.db");
    {
        let db = AgentDb::open(&path).unwrap();
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
    }
    let db = AgentDb::open(&path).unwrap();
    let count: i64 = db
        .with(|connection| {
            connection
                .query_row("SELECT count(*) FROM agent_profiles", [], |row| row.get(0))
                .map_err(sql)
        })
        .unwrap();
    assert_eq!(count, 1);
}

/// A database from a newer build is refused, not opened. Writing rows an older
/// schema cannot express is how a downgrade turns into data loss.
#[test]
fn refuses_a_database_from_a_newer_build() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("agents.db");
    {
        let connection = Connection::open(&path).unwrap();
        connection
            .pragma_update(None, "user_version", schema::target_version() + 5)
            .unwrap();
    }
    let error = AgentDb::open(&path).unwrap_err().to_string();
    assert!(error.contains("newer Vibyra"), "{error}");
}

/// Deleting a chat takes its transcript with it; deleting an agent does not
/// take the approval ledger, which has to outlive what it authorised.
#[test]
fn cascades_transcripts_but_keeps_the_approval_ledger() {
    let db = AgentDb::open_memory().unwrap();
    db.with(|connection| {
        connection.execute_batch(
            "INSERT INTO agent_profiles (id, account, name, engine, home_path, created_ms, updated_ms)
               VALUES ('a', 'acct', 'Nia', 'claude', '/tmp/a', 1, 1);
             INSERT INTO agent_chats (id, account, agent_id, engine, created_ms, updated_ms)
               VALUES ('c', 'acct', 'a', 'claude', 1, 1);
             INSERT INTO chat_events (chat_id, turn_id, seq, kind, payload, created_ms)
               VALUES ('c', 't', 0, 'assistant.completed', '{}', 1);
             INSERT INTO approval_requests
               (id, account, agent_id, chat_id, risk, action, fingerprint, created_ms)
               VALUES ('r', 'acct', 'a', 'c', 'publish', 'send', 'fp', 1);",
        ).unwrap();
        Ok(())
    })
    .unwrap();

    db.with(|connection| {
        connection
            .execute("DELETE FROM agent_profiles WHERE id = 'a'", [])
            .unwrap();
        let events: i64 = connection
            .query_row("SELECT count(*) FROM chat_events", [], |row| row.get(0))
            .unwrap();
        let chats: i64 = connection
            .query_row("SELECT count(*) FROM agent_chats", [], |row| row.get(0))
            .unwrap();
        let approvals: i64 = connection
            .query_row("SELECT count(*) FROM approval_requests", [], |row| {
                row.get(0)
            })
            .unwrap();
        let orphaned: Option<String> = connection
            .query_row("SELECT agent_id FROM approval_requests", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!((events, chats), (0, 0));
        assert_eq!(approvals, 1);
        assert_eq!(orphaned, None);
        Ok(())
    })
    .unwrap();
}

/// A failing task rolls the whole transaction back rather than leaving the
/// half of a domain operation that happened to run first.
#[test]
fn a_failed_transaction_leaves_nothing_behind() {
    let db = AgentDb::open_memory().unwrap();
    let outcome = db.transact(|connection| {
        connection
            .execute(
                "INSERT INTO agent_profiles \
                 (id, account, name, engine, home_path, created_ms, updated_ms) \
                 VALUES ('a', 'acct', 'Nia', 'claude', '/tmp/a', 1, 1)",
                [],
            )
            .map_err(sql)?;
        Err::<(), _>(CoreError::Settings("deliberate".into()))
    });
    assert!(outcome.is_err());
    let count: i64 = db
        .with(|connection| {
            connection
                .query_row("SELECT count(*) FROM agent_profiles", [], |row| row.get(0))
                .map_err(sql)
        })
        .unwrap();
    assert_eq!(count, 0);
}

/// The pre-upgrade copy is only taken when there is something to copy, and it
/// is named for the version it was taken *from* so a downgrade knows which
/// file it wants.
#[test]
fn backs_up_only_an_existing_database() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("agents.db");
    AgentDb::open(&path).unwrap();
    assert!(
        !backup_path(&path, 0).exists(),
        "a first run has nothing to back up"
    );

    backup::before_migration(&path, 1).unwrap();
    assert!(backup_path(&path, 1).exists());
}
