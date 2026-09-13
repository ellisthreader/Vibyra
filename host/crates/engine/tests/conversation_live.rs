//! Explicit provider acceptance: cargo test -p vibyra-host-engine --test conversation_live -- --ignored
//! Uses the computer's Codex login for one tiny turn in an isolated temporary project.
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use vibyra_host_engine::Engine;

#[test]
#[ignore = "requires an authenticated local Codex CLI and one live provider turn"]
fn real_codex_streams_through_host_then_restores_without_execution() {
    let directory = tempfile::tempdir().unwrap();
    let project = directory.path().join("project");
    std::fs::create_dir(&project).unwrap();
    let state_dir = directory.path().join("state");
    let engine = Engine::new(
        state_dir.clone(),
        vec![("Acceptance".into(), project.clone())],
    )
    .unwrap();
    let receiver = engine.subscribe();
    let project_id =
        engine.handle("phone", "host.state", json!({})).unwrap()["projects"][0]["id"].clone();
    let session = engine.handle("phone", "session.create", json!({"projectId":project_id,
        "requestId":uuid::Uuid::new_v4().to_string(),"kind":"codex","runner":"conversation","title":"Acceptance"})).unwrap();
    let id = session["id"].as_str().unwrap();
    let lease = engine
        .handle("phone", "session.claim", json!({"sessionId":id}))
        .unwrap();
    let submission = uuid::Uuid::new_v4().to_string();
    let accepted = engine
        .handle(
            "phone",
            "turn.submit",
            json!({"sessionId":id,"projectId":project_id,
        "generation":lease["generation"],"lease":lease["lease"],"submissionId":submission,
        "text":"Reply exactly: Vibyra is connected. Do not use any tools or change any files."}),
        )
        .unwrap();
    assert_eq!(
        accepted["status"], "accepted",
        "Host submission acknowledgement: {accepted}"
    );
    let deadline = Instant::now() + Duration::from_secs(60);
    let snapshot = loop {
        let snapshot = engine
            .handle("phone", "conversation.snapshot", json!({"sessionId":id}))
            .unwrap();
        if matches!(
            snapshot["turnState"].as_str(),
            Some("completed" | "failed" | "interrupted")
        ) {
            break snapshot;
        }
        if Instant::now() >= deadline {
            let _ = engine.handle("phone", "session.stop", json!({"sessionId":id}));
            panic!("Live turn did not finish within 60 seconds");
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    engine
        .handle("phone", "session.stop", json!({"sessionId":id}))
        .unwrap();
    assert_eq!(
        snapshot["turnState"], "completed",
        "Provider outcome: {snapshot}"
    );
    assert!(snapshot["items"]
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["role"] == "assistant"
            && item["text"]
                .as_str()
                .is_some_and(|s| s.contains("Vibyra is connected"))));
    let events: Vec<Value> = receiver.try_iter().collect();
    assert!(
        events
            .iter()
            .filter(|e| e["event"] == "conversation.updated")
            .count()
            >= 3
    );
    assert_eq!(
        std::fs::read_dir(&project).unwrap().count(),
        0,
        "No project writes were requested"
    );
    let id = id.to_owned();
    let recovery = directory.path().join("recovery");
    std::fs::create_dir(&recovery).unwrap();
    let connection = rusqlite::Connection::open(state_dir.join("engine.sqlite3")).unwrap();
    connection
        .execute(
            "VACUUM INTO ?1",
            [recovery.join("engine.sqlite3").to_string_lossy().as_ref()],
        )
        .unwrap();
    drop(connection);
    drop(engine);
    let restored = Engine::new(recovery, vec![("Acceptance".into(), project)]).unwrap();
    let saved = restored
        .handle("phone", "conversation.snapshot", json!({"sessionId":id}))
        .unwrap();
    assert_eq!(saved["processState"], "interrupted");
    assert_eq!(saved["turnState"], "completed");
    assert!(!saved["items"].as_array().unwrap().is_empty());
}

#[test]
#[ignore = "requires an authenticated local Codex CLI and one live question turn"]
fn real_codex_question_waits_for_explicit_phone_answer() {
    let directory = tempfile::tempdir().unwrap();
    let project = directory.path().join("project");
    std::fs::create_dir(&project).unwrap();
    let engine = Engine::new(
        directory.path().join("state"),
        vec![("Question".into(), project)],
    )
    .unwrap();
    let project_id =
        engine.handle("phone", "host.state", json!({})).unwrap()["projects"][0]["id"].clone();
    let session = engine.handle("phone", "session.create", json!({"projectId":project_id,
        "requestId":uuid::Uuid::new_v4().to_string(),"kind":"codex","runner":"conversation","title":"Question"})).unwrap();
    let id = session["id"].as_str().unwrap();
    let lease = engine
        .handle("phone", "session.claim", json!({"sessionId":id}))
        .unwrap();
    let mut control = json!({"sessionId":id,"projectId":project_id,"generation":lease["generation"],"lease":lease["lease"]});
    let mut turn = control.clone();
    turn["submissionId"] = json!(uuid::Uuid::new_v4().to_string());
    turn["text"] = json!("Use vibyra_ask_user now to ask one question: 'Which colour?' with id 'colour', header 'Colour', options Blue and Green, descriptions 'Blue theme' and 'Green theme', isOther false, isSecret false. Wait for the answer, then repeat the selected colour. Do not use other tools or change files.");
    assert_eq!(
        engine.handle("phone", "turn.submit", turn).unwrap()["status"],
        "accepted"
    );
    let deadline = Instant::now() + Duration::from_secs(60);
    let question = loop {
        let snapshot = engine
            .handle("phone", "conversation.snapshot", json!({"sessionId":id}))
            .unwrap();
        if let Some(question) = snapshot["pending"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["kind"] == "question")
        {
            break question.clone();
        }
        if Instant::now() >= deadline
            || snapshot["turnState"] == "completed"
            || snapshot["turnState"] == "failed"
        {
            engine
                .handle("phone", "session.stop", json!({"sessionId":id}))
                .unwrap();
            panic!("Provider did not ask a native question: {snapshot}");
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    control["requestId"] = question["requestId"].clone();
    control["actionVersion"] = question["actionVersion"].clone();
    control["decisionId"] = json!(uuid::Uuid::new_v4().to_string());
    let question_id = question["questions"][0]["id"].as_str().unwrap();
    let answer = question["questions"][0]["options"][0]["label"]
        .as_str()
        .unwrap();
    control["answers"] = json!({question_id:{"answers":[answer]}});
    assert_eq!(
        engine.handle("phone", "question.answer", control).unwrap()["status"],
        "responding"
    );
    let deadline = Instant::now() + Duration::from_secs(60);
    let snapshot = loop {
        let snapshot = engine
            .handle("phone", "conversation.snapshot", json!({"sessionId":id}))
            .unwrap();
        if matches!(
            snapshot["turnState"].as_str(),
            Some("completed" | "failed" | "interrupted")
        ) {
            break snapshot;
        }
        if Instant::now() >= deadline {
            engine
                .handle("phone", "session.stop", json!({"sessionId":id}))
                .unwrap();
            panic!("Question answer was not acknowledged");
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    engine
        .handle("phone", "session.stop", json!({"sessionId":id}))
        .unwrap();
    assert_eq!(snapshot["turnState"], "completed");
    assert_eq!(
        snapshot["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["id"] == question["id"])
            .unwrap()["status"],
        "accepted"
    );
    assert!(snapshot["items"].as_array().unwrap().iter().any(
        |i| i["role"] == "assistant" && i["text"].as_str().is_some_and(|s| s.contains(answer))
    ));
}
