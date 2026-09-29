use crate::Engine;
use serde_json::json;
use std::os::unix::fs::PermissionsExt;

#[test]
fn failed_initialization_retries_the_same_empty_session_then_stays_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let program = dir.path().join("provider");
    std::fs::write(&program, r#"#!/usr/bin/env python3
import sys,json,pathlib
for line in sys.stdin:
 v=json.loads(line)
 if 'id' not in v: continue
 result={}
 if v.get('method')=='thread/start':
  p=pathlib.Path('attempts'); n=int(p.read_text())+1 if p.exists() else 1; p.write_text(str(n))
  if n==1:
   print(json.dumps({'id':v['id'],'error':{'code':-32000,'message':'Choose a model advertised by this Claude account'}}),flush=True); continue
  result={'thread':{'id':'accepted-thread'},'model':'haiku','reasoningEffort':'none'}
 print(json.dumps({'id':v['id'],'result':result}),flush=True)
"#).unwrap();
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o700)).unwrap();
    let engine = Engine::for_desktop_project(
        dir.path().join("state"),
        "project".into(),
        "Project".into(),
        dir.path().into(),
        program,
        vec![],
    )
    .unwrap();
    let params =
        json!({"projectId":"project","kind":"codex","title":"Auto","requestId":"11111111-1111-4111-8111-111111111111"});
    let error = engine.create_conversation("phone", &params).unwrap_err();
    assert!(error.contains("advertised"), "{error}");
    let original = engine
        .shared
        .lock()
        .sessions
        .values()
        .next()
        .unwrap()
        .meta
        .id
        .clone();
    let recovered = engine.create_conversation("phone", &params).unwrap();
    assert_eq!(recovered["id"], original);
    assert_eq!(recovered["status"], "running");
    assert_eq!(
        engine.create_conversation("phone", &params).unwrap()["id"],
        original
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("attempts")).unwrap(),
        "2"
    );
    assert_eq!(engine.shared.lock().sessions.len(), 1);
}

#[test]
#[ignore = "explicit local account handshake; never sends a prompt"]
fn live_account_model_catalogues() {
    for provider in ["codex", "claude"] {
        let result = Engine::account_models(provider.into(), vec![]).unwrap();
        let models = result["data"].as_array().unwrap();
        assert!(!models.is_empty());
        println!("{provider}: {} real account models, no thread or prompt created", models.len());
    }
}
