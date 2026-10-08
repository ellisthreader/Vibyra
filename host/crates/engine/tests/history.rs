use rusqlite::params;
use serde_json::json;
use std::collections::HashSet;
use uuid::Uuid;
use vibyra_host_engine::Engine;

#[test]
fn long_history_stays_inside_frames_and_pages_without_lost_sessions() {
    let directory = tempfile::tempdir().unwrap();
    let project = directory.path().join("project");
    std::fs::create_dir(&project).unwrap();
    let projects = vec![("Test".into(), project)];
    let state_directory = directory.path().join("state");
    let engine = Engine::new(state_directory.clone(), projects.clone()).unwrap();
    let state = engine.handle("phone", "host.state", json!({})).unwrap();
    let project_id = state["projects"][0]["id"].clone();
    drop(engine);
    // The engine's PTY flusher may release its last sink Arc asynchronously.
    std::thread::sleep(std::time::Duration::from_millis(100));
    let db = rusqlite::Connection::open(state_directory.join("engine.sqlite3")).unwrap();
    let transaction = db.unchecked_transaction().unwrap();
    for index in 0..550 {
        let id = Uuid::new_v4().to_string();
        let metadata = json!({"id":id,"projectId":project_id,"title":"\"".repeat(160),
            "kind":"shell","status":"exited","createdAt":format!("2026-09-05T00:00:{index:04}Z")});
        db.execute(
            "INSERT INTO sessions(id,owner,request,metadata) VALUES(?1,'phone',?2,?3)",
            params![id, Uuid::new_v4().to_string(), metadata.to_string()],
        )
        .unwrap();
    }
    transaction.commit().unwrap();
    drop(db);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    let engine = loop {
        match Engine::new(state_directory.clone(), projects.clone()) {
            Ok(engine) => break engine,
            Err(_) if std::time::Instant::now() < deadline => {
                std::thread::sleep(std::time::Duration::from_millis(15))
            }
            Err(error) => panic!("host did not release its state directory: {error}"),
        }
    };
    let state = engine.handle("phone", "host.state", json!({})).unwrap();
    assert!(serde_json::to_vec(&state).unwrap().len() < 60 * 1024);
    assert_eq!(state["sessionCount"], 550);
    let mut ids: HashSet<_> = state["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|session| session["id"].as_str().unwrap().to_owned())
        .collect();
    let mut cursor = state["nextCursor"].clone();
    while !cursor.is_null() {
        let page = engine
            .handle(
                "phone",
                "session.list",
                json!({"cursor":cursor,"limit":100}),
            )
            .unwrap();
        assert!(serde_json::to_vec(&page).unwrap().len() < 60 * 1024);
        for session in page["sessions"].as_array().unwrap() {
            assert!(ids.insert(session["id"].as_str().unwrap().to_owned()));
        }
        cursor = page["nextCursor"].clone();
    }
    assert_eq!(ids.len(), 550);
}
