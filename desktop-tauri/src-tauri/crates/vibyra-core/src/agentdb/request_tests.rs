use super::{requests, AgentDb};
use crate::{agent_memory, agent_profiles};
use serde_json::json;

fn agent(db: &AgentDb, root: &std::path::Path, token: &str) -> agent_profiles::AgentProfile {
    agent_profiles::create_once(
        db,
        "account",
        root,
        serde_json::from_value(json!({
            "name":"Audit", "brief":"Keep useful context", "engine":"claude"
        }))
        .unwrap(),
        Some(token),
    )
    .unwrap()
}

#[test]
fn lost_creation_reply_retries_after_reopen_without_duplicate_home_or_grant() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("agents.db");
    let token = super::ids::new_id();
    let first = {
        let db = AgentDb::open(&path).unwrap();
        agent(&db, root.path(), &token)
    };
    let db = AgentDb::open(&path).unwrap();
    let retry = agent(&db, root.path(), &token);
    assert_eq!(first.id, retry.id);
    assert_eq!(agent_profiles::list(&db, "account").unwrap().len(), 1);
    assert_eq!(
        agent_profiles::list_places(&db, &first.id).unwrap().len(),
        1
    );
    assert_eq!(
        std::fs::read_dir(root.path().join("agents"))
            .unwrap()
            .count(),
        1
    );
}

#[test]
fn receipt_returns_current_data_and_never_resurrects_deleted_memory() {
    let root = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let agent = agent(&db, root.path(), &super::ids::new_id());
    let token = super::ids::new_id();
    let entry = || serde_json::from_value(json!({"class":"fact","body":"Old fact"})).unwrap();
    let first = agent_memory::record_once(
        &db,
        &agent.id,
        entry(),
        agent_memory::MemoryStatus::Active,
        Some(&token),
    )
    .unwrap();
    agent_memory::amend(&db, &first.id, Some("Corrected fact"), None, None).unwrap();
    let retry = agent_memory::record_once(
        &db,
        &agent.id,
        entry(),
        agent_memory::MemoryStatus::Active,
        Some(&token),
    )
    .unwrap();
    assert_eq!(retry.body, "Corrected fact");
    agent_memory::delete(&db, &first.id).unwrap();
    assert!(agent_memory::record_once(
        &db,
        &agent.id,
        entry(),
        agent_memory::MemoryStatus::Active,
        Some(&token)
    )
    .is_err());
    assert_eq!(
        requests::receipt(&db, "account", &token).unwrap().unwrap()["deleted"],
        true
    );
    assert!(agent_memory::list(&db, &agent.id).unwrap().is_empty());
    db.with(|c| {
        let cols: String = c
            .query_row(
                "SELECT sql FROM sqlite_master WHERE name='agent_write_receipts'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(!cols.contains("result TEXT"));
        Ok(())
    })
    .unwrap();
}

#[test]
fn changed_payload_and_another_account_cannot_replay_the_original_record() {
    let root = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let token = super::ids::new_id();
    let first = agent(&db, root.path(), &token);
    let request =
        || serde_json::from_value(json!({"name":"Different", "engine":"claude"})).unwrap();
    assert!(
        agent_profiles::create_once(&db, "account", root.path(), request(), Some(&token)).is_err()
    );
    assert!(std::path::Path::new(&first.home_path).is_dir());
    let other =
        agent_profiles::create_once(&db, "other", root.path(), request(), Some(&token)).unwrap();
    assert_ne!(first.id, other.id);
    assert_eq!(
        requests::receipt(&db, "other", &token).unwrap().unwrap()["result"]["id"],
        other.id
    );
    assert_eq!(agent_profiles::list(&db, "account").unwrap().len(), 1);
}
