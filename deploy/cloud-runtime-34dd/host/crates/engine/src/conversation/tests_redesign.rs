use super::{normalize, publish, stream, tests::setup};
use serde_json::json;
#[test]
fn summaries_exclude_raw_reasoning_and_keep_completed_content() {
    let raw = json!({"id":"summary","type":"reasoning","summary":["Reading the relevant files"],"content":["private reasoning must not appear"]});
    let item = normalize::item(&raw, &json!("turn"), true).unwrap();
    assert_eq!(item["category"], "reasoning");
    assert_eq!(item["detail"], "Reading the relevant files");
    assert!(!item.to_string().contains("private reasoning"));
}
#[test]
fn history_survives_live_window_eviction_and_reopen() {
    let (dir, engine, _) = setup();
    for n in 0..10000 {
        publish(&mut engine.shared.lock(),"session",Some(json!({"id":format!("item{n}"),"turnId":"turn","kind":"activity","detail":format!("Observed operation {n}"),"status":"completed"}))).unwrap();
    }
    assert_eq!(
        engine.shared.lock().conversations["session"].items.len(),
        512
    );
    let mut before = None;
    let mut ids = std::collections::HashSet::new();
    loop {
        let page = engine
            .handle(
                "observer",
                "conversation.snapshot",
                json!({"sessionId":"session","beforeCursor":before}),
            )
            .unwrap();
        let items = page["items"].as_array().unwrap();
        assert!(!items.is_empty());
        for item in items {
            assert!(ids.insert(item["id"].as_str().unwrap().to_owned()));
        }
        before = items.first().unwrap()["order"].as_u64();
        if page["hasMore"] != true {
            break;
        }
    }
    assert_eq!(ids.len(), 10000);
    engine.ptys.shutdown();
    drop(engine);
    std::thread::sleep(std::time::Duration::from_millis(120));
    let restored = crate::Engine::new(
        dir.path().join("state"),
        vec![("project".into(), dir.path().into())],
    )
    .unwrap();
    let page = restored
        .handle(
            "observer",
            "conversation.snapshot",
            json!({"sessionId":"session","beforeCursor":2}),
        )
        .unwrap();
    assert_eq!(page["items"][0]["id"], "item0");
}
#[test]
fn artifacts_are_session_bound_unicode_paginated_and_hash_checked() {
    let (_dir, engine, _) = setup();
    let content = "αβ😀".repeat(10000);
    publish(
        &mut engine.shared.lock(),
        "session",
        Some(json!({"id":"large","kind":"activity","detail":content,"status":"completed"})),
    )
    .unwrap();
    let snapshot = engine
        .handle(
            "observer",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    let artifact = &snapshot["items"][0]["artifact"];
    let mut offset = 0;
    let mut joined = String::new();
    loop {
        let page=engine.handle("observer","conversation.artifact",json!({"sessionId":"session","artifactId":artifact["id"],"hash":artifact["hash"],"offset":offset})).unwrap();
        joined.push_str(page["content"].as_str().unwrap());
        let Some(next) = page["nextOffset"].as_u64() else {
            break;
        };
        offset = next;
    }
    assert_eq!(joined, content);
    assert!(engine
        .handle(
            "observer",
            "conversation.artifact",
            json!({"sessionId":"session","artifactId":artifact["id"],"hash":"stale"})
        )
        .is_err());
    assert!(engine
        .handle(
            "observer",
            "conversation.artifact",
            json!({"sessionId":"other","artifactId":artifact["id"]})
        )
        .is_err());
    assert!(engine
        .handle(
            "observer",
            "conversation.artifact",
            json!({"sessionId":"session","artifactId":"../../etc/passwd"})
        )
        .is_err());
}
#[test]
fn public_history_does_not_expose_rpc_payload_or_secret_answers() {
    let (_dir, engine, _) = setup();
    stream::receive(&engine.shared, "session", super::tests::request());
    let snapshot = engine
        .handle(
            "observer",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert!(snapshot["items"][0].get("action").is_none());
    assert!(snapshot["pending"][0].get("rpcId").is_none());
}
#[test]
fn exact_project_rules_survive_restart_and_refuse_different_cwd_or_command() {
    let (dir, engine, _) = setup();
    let raw = super::tests::request();
    let item = super::requests::pending(
        raw["method"].as_str().unwrap(),
        &raw["id"],
        &raw["params"],
        "",
    )
    .unwrap();
    let project = engine.shared.lock().sessions["session"]
        .meta
        .project_id
        .clone();
    engine
        .shared
        .lock()
        .journal
        .save_trust(&project, &item)
        .unwrap();
    let key = super::policy::rule_key(&item).unwrap();
    let mut different = item.clone();
    different["action"]["cwd"] = json!("/another");
    assert_ne!(super::policy::rule_key(&different).unwrap(), key);
    different = item.clone();
    different["action"]["command"] = json!("touch another");
    assert_ne!(super::policy::rule_key(&different).unwrap(), key);
    engine.ptys.shutdown();
    drop(engine);
    std::thread::sleep(std::time::Duration::from_millis(120));
    let restored = crate::Engine::new(
        dir.path().join("state"),
        vec![("project".into(), dir.path().into())],
    )
    .unwrap();
    assert_eq!(
        restored
            .shared
            .lock()
            .journal
            .trust_rules(&project)
            .unwrap()[0]["id"],
        key
    );
}
#[test]
fn command_text_cannot_become_model_execution() {
    let (_dir, engine, mut p) = setup();
    p["submissionId"] = json!(uuid::Uuid::new_v4().to_string());
    p["text"] = json!("/unknown");
    assert!(engine
        .handle("phone", "turn.submit", p)
        .unwrap_err()
        .contains("command menu"));
    let catalogue = engine
        .handle(
            "observer",
            "conversation.commands",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    for name in ["usage", "status", "model", "effort"] {
        assert!(catalogue["commands"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["name"] == name));
    }
}
