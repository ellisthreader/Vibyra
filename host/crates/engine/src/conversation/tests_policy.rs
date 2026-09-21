use super::{
    runtime::Runtime,
    stream,
    tests::{request, setup},
};
use serde_json::{json, Value};
use std::{
    process::{Command, Stdio},
    sync::Arc,
    time::Duration,
};
fn wait_for(engine: &crate::Engine, status: &str) {
    for _ in 0..100 {
        if engine.shared.lock().conversations["session"]
            .items
            .last()
            .unwrap()["status"]
            == status
        {
            return;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    panic!("Provider acknowledgement did not converge to {status}");
}
#[test]
fn saved_exact_command_auto_approval_is_acknowledged_once_and_revocation_stops_future_grants() {
    let (dir, engine, mut p) = setup();
    let effects = dir.path().join("effects");
    let script = format!(
        r#"import json,sys
for line in sys.stdin:
 v=json.loads(line)
 if v.get('method')=='initialize': print(json.dumps({{'id':v['id'],'result':{{}}}}),flush=True)
 elif 'result' in v:
  with open({:?},'a') as f: f.write(json.dumps(v['result'])+'\n')
  print(json.dumps({{'method':'serverRequest/resolved','params':{{'threadId':'thread','requestId':v['id']}}}}),flush=True)
"#,
        effects.to_str().unwrap()
    );
    let mut command = Command::new("python3");
    command
        .args(["-u", "-c", &script])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    let weak = Arc::downgrade(&engine.shared);
    let runtime = Runtime::spawn_command(command, move |event| {
        if let Some(shared) = weak.upgrade() {
            stream::receive(&shared, "session", event);
        }
    })
    .unwrap();
    engine
        .shared
        .lock()
        .conversations
        .get_mut("session")
        .unwrap()
        .runtime = Some(runtime);
    stream::receive(&engine.shared, "session", request());
    let item = engine.shared.lock().conversations["session"].items[0].clone();
    p["requestId"] = item["requestId"].clone();
    p["actionVersion"] = item["actionVersion"].clone();
    p["decisionId"] = json!(uuid::Uuid::new_v4().to_string());
    p["decision"] = json!("acceptForProject");
    assert!(engine
        .handle("phone", "decision.resolve", p.clone())
        .unwrap_err()
        .contains("Mac"));
    let claim = engine.claim_locally("desktop", "session").unwrap();
    p["lease"] = claim["lease"].clone();
    p["generation"] = claim["generation"].clone();
    engine
        .handle("desktop", "decision.resolve", p.clone())
        .unwrap();
    wait_for(&engine, "accepted");
    assert_eq!(
        engine
            .handle("desktop", "decision.resolve", p.clone())
            .unwrap()["status"],
        "accepted"
    );
    let mut second = request();
    second["id"] = json!(100);
    stream::receive(&engine.shared, "session", second.clone());
    wait_for(&engine, "accepted");
    stream::receive(&engine.shared, "session", second); // duplicate callback must not execute again
    assert_eq!(
        std::fs::read_to_string(&effects).unwrap().lines().count(),
        2
    );
    let key = super::policy::rule_key(&item).unwrap();
    let mut revoke = p.clone();
    revoke["ruleId"] = json!(key);
    engine
        .handle("desktop", "conversation.trust.revoke", revoke)
        .unwrap();
    let mut third = request();
    third["id"] = json!(101);
    stream::receive(&engine.shared, "session", third);
    assert_eq!(
        engine.shared.lock().conversations["session"]
            .items
            .last()
            .unwrap()["status"],
        "pending"
    );
    assert_eq!(
        std::fs::read_to_string(&effects).unwrap().lines().count(),
        2
    );
}
#[test]
fn large_proposed_patches_are_complete_review_artifacts_and_network_scopes_are_explicit() {
    let (_dir, engine, _) = setup();
    let patch = format!("@@ -1 +1 @@\n-old\n+{}", "new".repeat(8000));
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"item/started","params":{"turnId":"turn","item":{
        "id":"patch","type":"fileChange","changes":[{"path":"file.txt","kind":{"type":"update"},"diff":patch}]}}}),
    );
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"item/fileChange/requestApproval","id":12,"params":{"threadId":"thread","turnId":"turn","itemId":"patch"}}),
    );
    let snapshot = engine
        .handle(
            "observer",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    let pending = &snapshot["pending"][0];
    assert_eq!(pending["kind"], "permission");
    assert_eq!(pending["hasDetail"], true);
    let mut offset = 0;
    let mut detail = String::new();
    loop {
        let page=engine.handle("observer","conversation.artifact",json!({"sessionId":"session","artifactId":pending["artifact"]["id"],"hash":pending["artifact"]["hash"],"offset":offset})).unwrap();
        detail.push_str(page["content"].as_str().unwrap());
        let Some(next) = page["nextOffset"].as_u64() else {
            break;
        };
        offset = next;
    }
    let parsed: Value = serde_json::from_str(&detail).unwrap();
    assert_eq!(parsed[0]["diff"], patch);
    let network = super::requests::pending(
        "item/commandExecution/requestApproval",
        &json!(13),
        &json!({"networkApprovalContext":{"host":"example.com","protocol":"https"}}),
        "",
    )
    .unwrap();
    assert!(network["detail"].as_str().unwrap().contains("example.com"));
    assert_eq!(network["persistentAvailable"], false);
}
