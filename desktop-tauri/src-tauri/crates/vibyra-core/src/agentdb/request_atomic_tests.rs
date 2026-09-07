use super::{ids::new_id, AgentDb};
use crate::agent_profiles;
use serde_json::json;

fn request() -> agent_profiles::NewAgent {
    serde_json::from_value(json!({"name":"Atomic","engine":"claude"})).unwrap()
}
#[test]
fn concurrent_duplicate_requests_create_exactly_one_record() {
    let root = tempfile::tempdir().unwrap();
    let db = std::sync::Arc::new(AgentDb::open_memory().unwrap());
    let token = new_id();
    std::thread::scope(|scope| {
        let workers: Vec<_> = (0..8)
            .map(|_| {
                scope.spawn(|| {
                    agent_profiles::create_once(
                        &db,
                        "account",
                        root.path(),
                        request(),
                        Some(&token),
                    )
                    .unwrap()
                    .id
                })
            })
            .collect();
        let ids: Vec<_> = workers.into_iter().map(|w| w.join().unwrap()).collect();
        assert!(ids.iter().all(|id| id == &ids[0]));
    });
    assert_eq!(agent_profiles::list(&db, "account").unwrap().len(), 1);
    assert_eq!(
        std::fs::read_dir(root.path().join("agents"))
            .unwrap()
            .count(),
        1
    );
}
#[test]
fn failed_receipt_commit_rolls_back_rows_and_reuses_its_reserved_home() {
    let root = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let token = new_id();
    db.with(|c| { c.execute_batch("CREATE TRIGGER fail_receipt BEFORE INSERT ON agent_write_receipts BEGIN SELECT RAISE(ABORT,'injected'); END;").unwrap(); Ok(()) }).unwrap();
    assert!(
        agent_profiles::create_once(&db, "account", root.path(), request(), Some(&token)).is_err()
    );
    assert!(agent_profiles::list(&db, "account").unwrap().is_empty());
    assert_eq!(
        std::fs::read_dir(root.path().join("agents"))
            .unwrap()
            .count(),
        1
    );
    db.with(|c| {
        c.execute_batch("DROP TRIGGER fail_receipt").unwrap();
        Ok(())
    })
    .unwrap();
    assert!(
        agent_profiles::create_once(&db, "account", root.path(), request(), Some(&token)).is_ok()
    );
}
#[test]
fn migration_preserves_existing_agents_and_rejects_malformed_tokens() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("agents.db");
    {
        let db = AgentDb::open(&path).unwrap();
        agent_profiles::create(&db, "account", root.path(), request()).unwrap();
        db.with(|c| {
            c.execute_batch("DROP TABLE agent_write_receipts; PRAGMA user_version=4;")
                .unwrap();
            Ok(())
        })
        .unwrap();
    }
    let db = AgentDb::open(&path).unwrap();
    assert_eq!(agent_profiles::list(&db, "account").unwrap().len(), 1);
    assert!(
        agent_profiles::create_once(&db, "account", root.path(), request(), Some("../../bad"))
            .is_err()
    );
    assert_eq!(agent_profiles::list(&db, "account").unwrap().len(), 1);
}

#[test]
fn changing_target_cannot_reuse_a_committed_request_token() {
    use crate::{agent_memory, routines};
    let root = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let first = agent_profiles::create(&db, "account", root.path(), request()).unwrap();
    let second = agent_profiles::create(&db, "account", root.path(), request()).unwrap();
    let token = new_id();
    let draft = |id: &str| {
        serde_json::from_value(json!({
            "agentId": id, "name":"Once", "instruction":"Read only",
            "schedule":{"kind":"every","minutes":60},"timezone":"UTC"
        }))
        .unwrap()
    };
    routines::create_once(&db, draft(&first.id), Some(&token)).unwrap();
    let error = routines::create_once(&db, draft(&second.id), Some(&token)).unwrap_err();
    assert!(error.to_string().contains("SAVE_CONFLICT:"));
    assert_eq!(routines::list(&db, None).unwrap().len(), 1);
    let memory = || serde_json::from_value(json!({"class":"fact", "body":"Keep once"})).unwrap();
    let token = new_id();
    agent_memory::record_once(
        &db,
        &first.id,
        memory(),
        agent_memory::MemoryStatus::Active,
        Some(&token),
    )
    .unwrap();
    let error = agent_memory::record_once(
        &db,
        &second.id,
        memory(),
        agent_memory::MemoryStatus::Active,
        Some(&token),
    )
    .unwrap_err();
    assert!(error.to_string().contains("SAVE_CONFLICT:"));
    assert!(agent_memory::list(&db, &second.id).unwrap().is_empty());
}
