use super::{runtime::Runtime, stream, tests::setup};
use serde_json::json;
use std::{
    process::{Command, Stdio},
    sync::Arc,
    time::Duration,
};

#[test]
fn phone_rule_choice_sends_exact_codex_decision_once() {
    let (dir, engine, mut reply) = setup();
    let effects = dir.path().join("provider-replies");
    let script = format!(
        r#"import json,sys
for line in sys.stdin:
 value=json.loads(line)
 if value.get('method')=='initialize': print(json.dumps({{'id':value['id'],'result':{{}}}}),flush=True)
 elif 'result' in value:
  with open({:?},'a') as output: output.write(json.dumps(value['result'])+'\n')
  print(json.dumps({{'method':'serverRequest/resolved','params':{{'threadId':'thread','requestId':value['id']}}}}),flush=True)
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
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"item/started","params":{
        "threadId":"thread","turnId":"turn","item":{"id":"command","type":"commandExecution",
        "command":"HKE_ALLOW_LAN=1 npm run start:website"}}}),
    );
    stream::receive(
        &engine.shared,
        "session",
        json!({"id":71,
        "method":"item/commandExecution/requestApproval","params":{"threadId":"thread","turnId":"turn",
        "itemId":"command","kind":"command","environmentId":"local","cwd":"/project",
        "additionalPermissions":{"network":{"enabled":true}},
        "proposedExecpolicyAmendment":["HKE_ALLOW_LAN=1","npm","run","start:website"],
        "availableDecisions":["accept","decline",{"acceptWithExecpolicyAmendment":{
            "execpolicy_amendment":["HKE_ALLOW_LAN=1","npm","run","start:website"]}}]}}),
    );
    let item = engine.shared.lock().conversations["session"]
        .items
        .last()
        .unwrap()
        .clone();
    reply["requestId"] = item["requestId"].clone();
    reply["actionVersion"] = item["actionVersion"].clone();
    reply["decisionId"] = json!(uuid::Uuid::new_v4().to_string());
    reply["decision"] = json!("acceptWithExecpolicyAmendment");
    assert_eq!(
        engine
            .handle("phone", "decision.resolve", reply.clone())
            .unwrap()["status"],
        "responding"
    );
    for _ in 0..100 {
        if effects.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let sent = std::fs::read_to_string(&effects).unwrap();
    let result: serde_json::Value = serde_json::from_str(sent.lines().next().unwrap()).unwrap();
    assert_eq!(
        result["decision"],
        json!({"acceptWithExecpolicyAmendment":{
        "execpolicy_amendment":["HKE_ALLOW_LAN=1","npm","run","start:website"]}})
    );
    engine.handle("phone", "decision.resolve", reply).unwrap();
    assert_eq!(
        std::fs::read_to_string(&effects).unwrap().lines().count(),
        1
    );
}
