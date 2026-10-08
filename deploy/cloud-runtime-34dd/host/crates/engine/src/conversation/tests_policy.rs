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
#[test]
fn permission_mode_updates_the_real_session_and_rejects_stale_or_unsupported_changes() {
    let (_dir, engine, mut p) = setup();
    engine
        .shared
        .lock()
        .conversations
        .get_mut("session")
        .unwrap()
        .settings = json!({
        "provider":"codex","model":"test","effort":"medium","approvalPolicy":"on-request",
        "sandbox":{"type":"workspaceWrite","writableRoots":[],"networkAccess":false,
            "excludeTmpdirEnvVar":false,"excludeSlashTmp":false},"permissionMode":"ask","revision":0
    });
    p["requestId"] = json!(uuid::Uuid::new_v4().to_string());
    p["revision"] = json!(0);
    p["mode"] = json!("auto");
    let updated = engine
        .handle("phone", "conversation.permissionMode", p.clone())
        .unwrap();
    assert_eq!(updated["permissionMode"], "auto");
    assert_eq!(updated["approvalPolicy"], "on-request");
    assert_eq!(updated["revision"], 1);
    assert_eq!(
        engine
            .handle("phone", "conversation.permissionMode", p.clone())
            .unwrap(),
        updated
    );
    assert_eq!(
        engine
            .handle(
                "phone",
                "conversation.snapshot",
                json!({"sessionId":"session"})
            )
            .unwrap()["settings"]["permissionMode"],
        "auto"
    );
    p["requestId"] = json!(uuid::Uuid::new_v4().to_string());
    assert!(engine
        .handle("phone", "conversation.permissionMode", p.clone())
        .unwrap_err()
        .contains("changed"));
    p["revision"] = json!(1);
    p["mode"] = json!("full");
    let full = engine
        .handle("phone", "conversation.permissionMode", p.clone())
        .unwrap();
    assert_eq!(full["approvalPolicy"], "never");
    assert_eq!(full["sandbox"]["type"], "dangerFullAccess");
    p["requestId"] = json!(uuid::Uuid::new_v4().to_string());
    p["revision"] = json!(2);
    p["mode"] = json!("ask");
    let ask = engine
        .handle("phone", "conversation.permissionMode", p.clone())
        .unwrap();
    assert_eq!(ask["sandbox"]["type"], "workspaceWrite");
    assert!(ask["sandbox"]["writableRoots"].is_array());
    let mut state = engine.shared.lock();
    state.conversations.get_mut("session").unwrap().settings["provider"] = json!("claude");
    drop(state);
    p["requestId"] = json!(uuid::Uuid::new_v4().to_string());
    p["revision"] = json!(3);
    p["mode"] = json!("full");
    assert!(engine
        .handle("phone", "conversation.permissionMode", p)
        .unwrap_err()
        .contains("unavailable"));
}
#[test]
fn approve_for_me_accepts_standard_commands_but_leaves_extra_access_for_review() {
    let (_dir, engine, mut p) = setup();
    let script = r#"import json,sys
for line in sys.stdin:
 v=json.loads(line)
 if v.get('method')=='initialize': print(json.dumps({'id':v['id'],'result':{}}),flush=True)
 elif 'result' in v: print(json.dumps({'method':'serverRequest/resolved','params':{'threadId':'thread','requestId':v['id']}}),flush=True)
"#;
    let mut command = Command::new("python3");
    command
        .args(["-u", "-c", script])
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
    p["requestId"] = json!(uuid::Uuid::new_v4().to_string());
    p["revision"] = json!(0);
    p["mode"] = json!("auto");
    engine
        .handle("phone", "conversation.permissionMode", p)
        .unwrap();
    stream::receive(&engine.shared, "session", request());
    wait_for(&engine, "accepted");
    let mut extra = request();
    extra["id"] = json!(101);
    extra["params"]["additionalPermissions"] =
        json!({"network":{"enabled":true},"fileSystem":null});
    stream::receive(&engine.shared, "session", extra);
    assert_eq!(
        engine.shared.lock().conversations["session"]
            .items
            .last()
            .unwrap()["status"],
        "pending"
    );
}
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
fn saved_exact_command_respects_ask_mode_and_duplicate_approvals_execute_once() {
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
    stream::receive(&engine.shared, "session", second);
    assert_eq!(
        engine.shared.lock().conversations["session"]
            .items
            .last()
            .unwrap()["status"],
        "pending",
        "Ask for Approval must still ask even with a saved project rule"
    );
    engine
        .shared
        .lock()
        .conversations
        .get_mut("session")
        .unwrap()
        .settings["permissionMode"] = json!("auto");
    let mut third = request();
    third["id"] = json!(101);
    stream::receive(&engine.shared, "session", third.clone());
    wait_for(&engine, "accepted");
    stream::receive(&engine.shared, "session", third); // duplicate callback must not execute again
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
    assert!(engine
        .shared
        .lock()
        .journal
        .trust_rules(&p["projectId"].as_str().unwrap())
        .unwrap()
        .as_array()
        .unwrap()
        .is_empty());
    engine
        .shared
        .lock()
        .conversations
        .get_mut("session")
        .unwrap()
        .settings["permissionMode"] = json!("ask");
    let mut fourth = request();
    fourth["id"] = json!(102);
    stream::receive(&engine.shared, "session", fourth);
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
