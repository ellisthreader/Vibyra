#![cfg(unix)]
mod support;
use serde_json::json;
use uuid::Uuid;
use vibyra_host_engine::Engine;

#[test]
fn interrupted_session_and_creation_receipt_survive_host_restart() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("project");
    std::fs::create_dir(&path).unwrap();
    let engine = Engine::new(
        directory.path().join("state"),
        vec![("Test".into(), path.clone())],
    )
    .unwrap();
    let state = engine.handle("phone-a", "host.state", json!({})).unwrap();
    let params = json!({"projectId":state["projects"][0]["id"],"title":"Recover",
        "kind":"shell","requestId":Uuid::new_v4().to_string()});
    let original = engine
        .handle("phone-a", "session.create", params.clone())
        .unwrap();
    let repeated = engine
        .handle("phone-a", "session.create", params.clone())
        .unwrap();
    assert_eq!(repeated["id"], original["id"]);
    // Simulate stale durable metadata while the host process was running: copy
    // using SQLite's online backup equivalent VACUUM INTO before clean shutdown.
    let backup = directory.path().join("saved.sqlite3");
    let connection =
        rusqlite::Connection::open(directory.path().join("state/engine.sqlite3")).unwrap();
    connection
        .execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])
        .unwrap();
    drop(connection);
    drop(engine);
    let recovery = directory.path().join("recovery");
    std::fs::create_dir(&recovery).unwrap();
    std::fs::copy(backup, recovery.join("engine.sqlite3")).unwrap();
    let restarted = Engine::new(recovery, vec![("Test".into(), path)]).unwrap();
    let retry = restarted
        .handle("phone-a", "session.create", params.clone())
        .unwrap();
    assert_eq!(retry["id"], original["id"]);
    assert_eq!(retry["status"], "interrupted");
    assert!(restarted
        .handle(
            "phone-a",
            "session.claim",
            json!({"sessionId":original["id"]})
        )
        .is_err());
    let mut conflicting = params;
    conflicting["title"] = json!("Different action");
    assert!(restarted
        .handle("phone-a", "session.create", conflicting)
        .is_err());
}

#[test]
fn snapshot_and_events_share_utf8_offsets_without_duplicate_replay() {
    let host = support::Harness::new();
    let session = host.create();
    let lease = host.claim(&session);
    let events = host.engine.subscribe();
    let snapshot = host.snapshot(&session);
    let cursor = snapshot["offset"].as_u64().unwrap();
    host.engine
        .handle(
            "phone-a",
            "session.input",
            host.input(&session, &lease, "printf 'snow-雪-🦀'; exit\n"),
        )
        .unwrap();
    support::wait(|| host.snapshot(&session)["status"] == "exited");
    let mut next = cursor;
    for event in events
        .try_iter()
        .filter(|event| event["event"] == "terminal.output")
    {
        let end = event["data"]["offset"].as_u64().unwrap();
        if end <= cursor {
            continue;
        }
        let output = event["data"]["output"].as_str().unwrap();
        assert_eq!(end, next + output.len() as u64);
        next = end;
    }
    assert_eq!(next, host.snapshot(&session)["offset"].as_u64().unwrap());
}

#[test]
fn simultaneous_create_retries_share_one_actual_process() {
    let host = support::Harness::new();
    let params = json!({"projectId":host.project,"title":"One process","kind":"shell",
        "requestId":Uuid::new_v4().to_string()});
    let engine = std::sync::Arc::new(host.engine);
    let workers: Vec<_> = (0..8)
        .map(|_| {
            let engine = engine.clone();
            let params = params.clone();
            std::thread::spawn(move || engine.handle("phone-a", "session.create", params).unwrap())
        })
        .collect();
    let sessions: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert!(sessions
        .iter()
        .all(|session| session["id"] == sessions[0]["id"]));
    let state = engine.handle("phone-a", "host.state", json!({})).unwrap();
    assert_eq!(state["sessions"].as_array().unwrap().len(), 1);
}
