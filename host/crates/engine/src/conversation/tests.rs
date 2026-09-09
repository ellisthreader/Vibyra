use super::{model::Conversation, requests, stream};
use crate::{
    state::{Metadata, Session},
    Engine,
};
use serde_json::{json, Value};
use std::{
    process::{Command, Stdio},
    sync::Arc,
    time::Duration,
};

pub(super) fn setup() -> (tempfile::TempDir, Engine, Value) {
    let dir = tempfile::tempdir().unwrap();
    let engine = Engine::new(
        dir.path().join("state"),
        vec![("project".into(), dir.path().into())],
    )
    .unwrap();
    let project = engine.shared.lock().projects[0].id.clone();
    let session = Session::restored(
        Metadata {
            id: "session".into(),
            project_id: project.clone(),
            title: "Chat".into(),
            kind: "codex".into(),
            status: "running".into(),
            created_at: crate::now(),
            runner: Some("conversation".into()),
        },
        "phone".into(),
        "create".into(),
    );
    let generation = session.generation.clone();
    let mut c = Conversation::new(generation);
    c.thread_id = "thread".into();
    c.turn_id = Some("turn".into());
    let mut state = engine.shared.lock();
    state.journal.save(&session).unwrap();
    state.sessions.insert("session".into(), session);
    state.conversations.insert("session".into(), c);
    drop(state);
    let lease = engine
        .handle("phone", "session.claim", json!({"sessionId":"session"}))
        .unwrap();
    let p = json!({"sessionId":"session","projectId":project,"generation":lease["generation"],"lease":lease["lease"]});
    (dir, engine, p)
}
pub(super) fn request() -> Value {
    json!({"method":"item/commandExecution/requestApproval","id":99,
        "params":{"threadId":"thread","turnId":"turn","itemId":"command","command":"touch allowed",
            "cwd":"/project","reason":"Write a test file"}})
}
#[test]
fn decisions_are_bound_to_controller_generation_and_exact_action() {
    let (_dir, engine, mut p) = setup();
    stream::receive(&engine.shared, "session", request());
    let item = engine.shared.lock().conversations["session"].items[0].clone();
    p["requestId"] = item["requestId"].clone();
    p["actionVersion"] = item["actionVersion"].clone();
    p["decisionId"] = json!(uuid::Uuid::new_v4().to_string());
    p["decision"] = json!("accept");
    assert!(engine
        .handle("observer", "decision.resolve", p.clone())
        .unwrap_err()
        .contains("lease"));
    let mut stale = p.clone();
    stale["generation"] = json!("old");
    assert!(engine
        .handle("phone", "decision.resolve", stale)
        .unwrap_err()
        .contains("generation"));
    let mut changed = p.clone();
    changed["actionVersion"] = json!("different");
    assert!(engine
        .handle("phone", "decision.resolve", changed)
        .unwrap_err()
        .contains("changed"));
    let mut wrong = p.clone();
    wrong["projectId"] = json!("another");
    assert!(engine
        .handle("phone", "decision.resolve", wrong)
        .unwrap_err()
        .contains("project"));
    engine.disconnected("phone");
    assert!(engine
        .handle("phone", "decision.resolve", p)
        .unwrap_err()
        .contains("control"));
}
#[test]
fn restore_expires_pending_and_never_claims_unknown_execution_completed() {
    let (_dir, engine, _) = setup();
    stream::receive(&engine.shared, "session", request());
    let mut state = engine.shared.lock();
    let c = state.conversations.get_mut("session").unwrap();
    c.receipts
        .insert("submission".into(), json!({"status":"dispatching"}));
    c.restore();
    assert_eq!(c.items[0]["status"], "expired");
    assert_eq!(c.receipts["submission"]["status"], "unknown");
    assert_eq!(c.turn_state, "interrupted");
}
#[test]
fn history_and_pending_stay_under_transport_frame_and_keep_stable_order() {
    let mut c = Conversation::new("g".into());
    for i in 0..600 {
        c.update(
            "s",
            "p",
            Some(json!({"id":i,"kind":"message","text":"😀".repeat(2000),"status":"completed"})),
        );
    }
    let original = c.items[0]["order"].clone();
    c.update(
        "s",
        "p",
        Some(json!({"id":88,"status":"completed","text":"updated"})),
    );
    assert_eq!(c.items[0]["order"], original);
    let snapshot = c.snapshot("s", "p", None);
    assert!(snapshot.to_string().len() < 60 * 1024);
    assert_eq!(snapshot["hasMore"], true);
    assert_eq!(c.items.len(), 512);
    assert_eq!(c.events.len(), 128);
}
#[test]
fn unsupported_or_truncated_permissions_are_not_approvable() {
    assert!(
        requests::pending("item/fileChange/requestApproval", &json!(1), &json!({}), "").is_none()
    );
    assert!(requests::pending(
        "item/commandExecution/requestApproval",
        &json!(1),
        &json!({"command":"x".repeat(8000)}),
        ""
    )
    .is_none());
    assert!(requests::pending(
        "item/permissions/requestApproval",
        &json!(1),
        &json!({}),
        ""
    )
    .is_none());
}
#[test]
fn accepted_response_requires_provider_ack_and_duplicates_do_not_execute_twice() {
    let (dir, engine, mut p) = setup();
    let marker = dir.path().join("effects");
    let script = format!(
        r#"import json,sys
for line in sys.stdin:
 v=json.loads(line)
 if v.get('method')=='initialize': print(json.dumps({{'id':v['id'],'result':{{}}}}),flush=True)
 elif 'result' in v:
  if v['result'].get('decision')=='accept':
   with open({:?},'a') as f: f.write('executed\n')
  print(json.dumps({{'method':'serverRequest/resolved','params':{{'threadId':'thread','requestId':v['id']}}}}),flush=True)
"#,
        marker.to_str().unwrap()
    );
    let mut command = Command::new("python3");
    command
        .args(["-u", "-c", &script])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let weak = Arc::downgrade(&engine.shared);
    let runtime = super::runtime::Runtime::spawn_command(command, move |e| {
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
    stream::receive(&engine.shared, "session", request());
    let item = engine.shared.lock().conversations["session"].items[0].clone();
    p["requestId"] = item["requestId"].clone();
    p["actionVersion"] = item["actionVersion"].clone();
    p["decisionId"] = json!(uuid::Uuid::new_v4().to_string());
    p["decision"] = json!("accept");
    assert_eq!(
        engine
            .handle("phone", "decision.resolve", p.clone())
            .unwrap()["status"],
        "responding"
    );
    for _ in 0..100 {
        if engine.shared.lock().conversations["session"].items[0]["status"] == "accepted" {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(
        engine
            .handle("phone", "decision.resolve", p.clone())
            .unwrap()["status"],
        "accepted"
    );
    assert_eq!(std::fs::read_to_string(marker).unwrap(), "executed\n");
    p["decision"] = json!("decline");
    assert!(engine
        .handle("phone", "decision.resolve", p.clone())
        .is_err());
    let mut declined = request();
    declined["id"] = json!(100);
    stream::receive(&engine.shared, "session", declined);
    let item = engine.shared.lock().conversations["session"]
        .items
        .last()
        .unwrap()
        .clone();
    p["requestId"] = item["requestId"].clone();
    p["actionVersion"] = item["actionVersion"].clone();
    p["decisionId"] = json!(uuid::Uuid::new_v4().to_string());
    engine
        .handle("phone", "decision.resolve", p.clone())
        .unwrap();
    for _ in 0..100 {
        if engine.shared.lock().conversations["session"]
            .items
            .last()
            .unwrap()["status"]
            == "declined"
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(
        engine.handle("phone", "decision.resolve", p).unwrap()["status"],
        "declined"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("effects")).unwrap(),
        "executed\n"
    );
}
