use super::*;
use crate::conversation::{runtime::Runtime, tests::setup};
use std::{
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};

#[test]
fn status_tool_uses_session_scope_and_controller_not_model_supplied_arguments() {
    let (dir, engine, params) = setup();
    let received = Arc::new(Mutex::new(Vec::new()));
    let seen = received.clone();
    engine.set_preview_status_provider(Arc::new(move |device, project| {
        seen.lock()
            .unwrap()
            .push((device.to_owned(), project.to_owned()));
        Ok(json!({"state":"sharing_required","firstFrameDecoded":false}))
    }));
    let output = dir.path().join("reply.json");
    let mut command = Command::new("python3");
    command
        .args([
            "-u",
            "-c",
            r#"import json,sys
for line in sys.stdin:
 v=json.loads(line)
 if v.get('method')=='initialize': print(json.dumps({'id':v['id'],'result':{}}),flush=True)
 elif v.get('id')=='preview-call': open(sys.argv[1],'w').write(json.dumps(v))
"#,
        ])
        .arg(&output)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    let runtime = Runtime::spawn_command(command, |_| {}).unwrap();
    engine
        .shared
        .lock()
        .conversations
        .get_mut("session")
        .unwrap()
        .runtime = Some(runtime);
    let request = json!({"id":"preview-call","method":"item/tool/call","params":{
        "threadId":"thread","tool":NAME,"arguments":{"projectId":"another-project","device":"another-phone"}}});
    receive(&engine.shared, "session", Some("stale"), &request);
    assert!(received.lock().unwrap().is_empty());
    let mut wrong_thread = request.clone();
    wrong_thread["params"]["threadId"] = json!("other-thread");
    receive(&engine.shared, "session", None, &wrong_thread);
    assert!(received.lock().unwrap().is_empty());
    assert!(receive(&engine.shared, "session", None, &request));
    assert_eq!(
        *received.lock().unwrap(),
        vec![("phone".into(), params["projectId"].as_str().unwrap().into())]
    );
    for _ in 0..50 {
        if output.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let reply: Value = serde_json::from_slice(&std::fs::read(output).unwrap()).unwrap();
    assert_eq!(reply["result"]["success"], true);
    assert!(reply["result"]["contentItems"][0]["text"]
        .as_str()
        .unwrap()
        .contains("sharing_required"));
    assert!(
        engine.shared.lock().conversations["session"]
            .items
            .is_empty(),
        "Status must not create a user permission request"
    );
}
