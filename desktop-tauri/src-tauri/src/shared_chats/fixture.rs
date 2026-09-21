use super::*;
use std::os::unix::fs::PermissionsExt;
pub(crate) fn fixture() -> (tempfile::TempDir, Arc<SharedChats>, Value) {
    let dir = tempfile::tempdir().unwrap();
    let program = dir.path().join("provider");
    std::fs::write(&program, r#"#!/usr/bin/env python3
import json,sys,os
n=0
for line in sys.stdin:
 v=json.loads(line); m=v.get('method'); result={}
 if m in ['thread/start','thread/resume']:
  if m=='thread/resume' and os.path.exists(os.path.join(os.path.dirname(__file__),'fail-resume')):
   print(json.dumps({'id':v['id'],'error':{'message':'Saved thread unavailable'}}),flush=True); continue
  result={'thread':{'id':'fixture-thread'}}
  with open(os.path.join(os.path.dirname(__file__),'launches'),'a') as f: f.write(json.dumps(v['params'])+'\n')
 elif m=='turn/start':
  n+=1
  with open('effects','a') as f: f.write('executed\n')
  result={'turn':{'id':'t'+str(n)}}
 elif m not in ['initialize','turn/interrupt','thread/unsubscribe']: continue
 print(json.dumps({'id':v['id'],'result':result}),flush=True)
 if m=='turn/start':
  print(json.dumps({'method':'turn/completed','params':{'threadId':'fixture-thread','turn':{'id':'t'+str(n),'status':'completed'}}}),flush=True)
"#).unwrap();
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o700)).unwrap();
    let engine = Arc::new(
        Engine::for_desktop_project(
            dir.path().join("journal"),
            "project".into(),
            "Project".into(),
            dir.path().into(),
            program,
            vec![],
        )
        .unwrap(),
    );
    let project = Project::new(
        "project".into(),
        "Project".into(),
        dir.path().into(),
        "default".into(),
    )
    .unwrap();
    let chats = Arc::new(SharedChats {
        cli: super::cli::CliTerminals::default(),
        path: dir.path().into(),
        slots: Mutex::new(vec![Slot {
            project,
            engine: engine.clone(),
        }]),
        error: None,
        local_action: Mutex::new(()),
    });
    let session = engine
        .handle(
            "desktop",
            "session.create",
            json!({"projectId":"project","requestId":"11111111-1111-4111-a111-111111111111",
        "title":"Test","kind":"codex","runner":"conversation"}),
        )
        .unwrap();
    (dir, chats, session)
}
