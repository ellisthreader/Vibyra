use super::{runtime::Runtime, stream, tests::setup};
use serde_json::json;
use std::{
    process::{Command, Stdio},
    sync::Arc,
};

#[test]
fn definitive_provider_rejection_is_failed_not_unknown_or_stuck_running() {
    let (_dir, engine, mut params) = setup();
    let script = r#"import json,sys
for line in sys.stdin:
 v=json.loads(line)
 if v.get('method')=='initialize': print(json.dumps({'id':v['id'],'result':{}}),flush=True)
 elif v.get('method')=='turn/start': print(json.dumps({'id':v['id'],'error':{'code':-32602,'message':'Unsupported model'}}),flush=True)
"#;
    let mut command = Command::new("python3");
    command
        .args(["-u", "-c", script])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    let weak = Arc::downgrade(&engine.shared);
    let runtime = Runtime::spawn_command(command, move |e| {
        if let Some(s) = weak.upgrade() {
            stream::receive(&s, "session", e);
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
    params["submissionId"] = json!(uuid::Uuid::new_v4().to_string());
    params["text"] = json!("Hello");
    let result = engine
        .handle("phone", "turn.submit", params.clone())
        .unwrap();
    assert_eq!(result["status"], "failed");
    assert_eq!(
        engine.shared.lock().conversations["session"].turn_state,
        "failed"
    );
    assert_eq!(
        engine
            .handle("phone", "turn.submit", params.clone())
            .unwrap()["status"],
        "failed"
    );
    params["submissionId"] = json!(uuid::Uuid::new_v4().to_string());
    assert_eq!(
        engine.handle("phone", "turn.submit", params).unwrap()["status"],
        "failed"
    );
}
#[test]
fn late_started_event_reconciles_only_the_active_unknown_submission() {
    let (_dir, engine, _) = setup();
    {
        let mut state = engine.shared.lock();
        let c = state.conversations.get_mut("session").unwrap();
        c.active_submission = Some("new".into());
        c.receipts
            .insert("old".into(), json!({"status":"unknown","text":"old"}));
        c.receipts
            .insert("new".into(), json!({"status":"unknown","text":"new"}));
    }
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"turn/started","params":{"threadId":"thread","turn":{"id":"new-turn"}}}),
    );
    let state = engine.shared.lock();
    let c = &state.conversations["session"];
    assert_eq!(c.receipts["old"]["status"], "unknown");
    assert_eq!(c.receipts["new"]["status"], "accepted");
}
#[test]
fn missing_submission_status_is_explicit_and_does_not_create_a_receipt() {
    let (_dir, engine, _) = setup();
    let result = engine
        .handle(
            "phone",
            "turn.submissionStatus",
            json!({"sessionId":"session","submissionId":"missing"}),
        )
        .unwrap();
    assert_eq!(result["status"], "notFound");
    assert!(engine.shared.lock().conversations["session"]
        .receipts
        .is_empty());
}
