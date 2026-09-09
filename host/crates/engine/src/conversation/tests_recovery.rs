use super::{
    requests, stream,
    tests::{request, setup},
};
use serde_json::json;

#[test]
fn questions_validate_ids_choices_and_explicit_free_text() {
    let item = json!({"questions":[{"id":"choice","options":[{"label":"One"},{"label":"Two"}],"isOther":false}]});
    assert!(requests::answers(&item, &json!({"answers":{"choice":{"answers":["One"]}}})).is_ok());
    assert!(requests::answers(&item, &json!({"answers":{"wrong":{"answers":["One"]}}})).is_err());
    assert!(
        requests::answers(&item, &json!({"answers":{"choice":{"answers":["Custom"]}}})).is_err()
    );
    assert!(requests::answers(&item, &json!({"answers":{"choice":{"answers":[]}}})).is_err());
    let free = json!({"questions":[{"id":"choice","options":null}]});
    assert!(requests::answers(
        &free,
        &json!({"answers":{"choice":{"answers":["Custom answer"]}}})
    )
    .is_ok());
}
#[test]
fn restart_restores_last_known_history_but_expires_live_requests() {
    let (dir, engine, _) = setup();
    stream::receive(&engine.shared, "session", request());
    let before = engine
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(before["pending"].as_array().unwrap().len(), 1);
    let recovery = dir.path().join("recovery");
    std::fs::create_dir(&recovery).unwrap();
    let connection = rusqlite::Connection::open(dir.path().join("state/engine.sqlite3")).unwrap();
    connection
        .execute(
            "VACUUM INTO ?1",
            [recovery.join("engine.sqlite3").to_string_lossy().as_ref()],
        )
        .unwrap();
    drop(connection);
    drop(engine);
    let restored =
        crate::Engine::new(recovery, vec![("project".into(), dir.path().into())]).unwrap();
    let after = restored
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(after["processState"], "interrupted");
    assert_eq!(after["items"][0]["status"], "expired");
    assert!(after["pending"].as_array().unwrap().is_empty());
    assert!(restored
        .handle("phone", "session.claim", json!({"sessionId":"session"}))
        .is_err());
}
#[test]
fn replay_gaps_require_snapshot_and_late_completion_never_invents_checks() {
    let (_dir, engine, _) = setup();
    for i in 0..160 {
        stream::receive(
            &engine.shared,
            "session",
            json!({"method":"item/agentMessage/delta",
            "params":{"threadId":"thread","turnId":"turn","itemId":"message","delta":i.to_string()}}),
        );
    }
    let replay = engine
        .handle(
            "phone",
            "conversation.events",
            json!({"sessionId":"session","afterCursor":0}),
        )
        .unwrap();
    assert_eq!(replay["resetRequired"], true);
    assert!(replay.to_string().len() < 60 * 1024);
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"turn/completed",
        "params":{"threadId":"thread","turn":{"id":"turn","status":"failed","error":{"message":"Provider failed"}}}}),
    );
    let snapshot = engine
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(snapshot["turnState"], "failed");
    assert_eq!(
        snapshot["items"].as_array().unwrap().last().unwrap()["text"],
        "Provider failed"
    );
    assert!(!snapshot.to_string().contains("checks passed"));
}
#[test]
fn too_many_requests_and_added_permissions_fail_closed() {
    let (_dir, engine, _) = setup();
    for i in 0..5 {
        let mut r = request();
        r["id"] = json!(i);
        stream::receive(&engine.shared, "session", r);
    }
    let snapshot = engine
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(snapshot["pending"].as_array().unwrap().len(), 2);
    let mut r = request();
    r["params"]["additionalPermissions"] = json!({"network":true});
    assert!(requests::pending(r["method"].as_str().unwrap(), &r["id"], &r["params"], "").is_none());
}
