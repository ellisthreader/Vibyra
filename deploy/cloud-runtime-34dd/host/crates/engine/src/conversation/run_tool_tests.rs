use super::*;
use crate::conversation::{runtime::Runtime, tests::setup};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// A stand-in Codex that records every reply to the tool call.
fn fake_codex(dir: &std::path::Path, engine: &crate::Engine) -> std::path::PathBuf {
    let output = dir.join("replies.jsonl");
    let mut command = Command::new("python3");
    command
        .args([
            "-u",
            "-c",
            r#"import json,sys
for line in sys.stdin:
 v=json.loads(line)
 if v.get('method')=='initialize': print(json.dumps({'id':v['id'],'result':{}}),flush=True)
 elif v.get('id')=='run-call': open(sys.argv[1],'a').write(json.dumps(v)+'\n')
"#,
        ])
        .arg(&output)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    let runtime = Runtime::spawn_command(command, |_| {}).unwrap();
    let mut state = engine.shared.lock();
    state.conversations.get_mut("session").unwrap().runtime = Some(runtime);
    output
}

fn call(command: &str) -> Value {
    json!({"id":"run-call","method":"item/tool/call","params":{
        "threadId":"thread","turnId":"turn","callId":"call","tool":NAME,
        "arguments":{"command":command}}})
}

fn replies(output: &std::path::Path, count: usize) -> Vec<Value> {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let text = std::fs::read_to_string(output).unwrap_or_default();
        let lines = text
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect::<Vec<_>>();
        if lines.len() >= count || Instant::now() > deadline {
            return lines;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn an_approved_app_starts_without_blocking_the_event_worker() {
    let (dir, engine, params) = setup();
    let output = fake_codex(dir.path(), &engine);
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&seen);
    engine.set_preview_run_provider(Arc::new(move |request| {
        sink.lock().unwrap().push(request.clone());
        std::thread::sleep(Duration::from_millis(400));
        Ok(RunOutcome::Started(json!({"runState":"building"})))
    }));
    let before = Instant::now();
    assert!(receive(
        &engine.shared,
        "session",
        None,
        &call("npm run tauri:dev")
    ));
    assert!(
        before.elapsed() < Duration::from_millis(200),
        "receive must not wait"
    );
    let reply = &replies(&output, 1)[0];
    assert_eq!(reply["result"]["success"], true);
    assert!(reply["result"]["contentItems"][0]["text"]
        .as_str()
        .unwrap()
        .contains("building"));
    let request = seen.lock().unwrap()[0].clone();
    assert_eq!(request.device, "phone");
    assert_eq!(request.project, params["projectId"].as_str().unwrap());
    assert_eq!(request.command.as_deref(), Some("npm run tauri:dev"));
    assert!(request.approve_token.is_none());
}

fn needs_approval() -> (
    tempfile::TempDir,
    crate::Engine,
    Value,
    std::path::PathBuf,
    Arc<Mutex<Vec<RunRequest>>>,
) {
    let (dir, engine, params) = setup();
    let output = fake_codex(dir.path(), &engine);
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&seen);
    engine.set_preview_run_provider(Arc::new(move |request| {
        sink.lock().unwrap().push(request.clone());
        Ok(match request.approve_token {
            Some(_) => RunOutcome::Started(json!({"runState":"building"})),
            None => RunOutcome::NeedsApproval {
                token: "plan-token".into(),
                name: "Desktop app (rust:dev)".into(),
                command: "npm run rust:dev".into(),
                cwd: "HKE".into(),
                body: Some("cargo run".into()),
            },
        })
    }));
    receive(&engine.shared, "session", None, &call("npm run rust:dev"));
    let deadline = Instant::now() + Duration::from_secs(5);
    while engine.shared.lock().conversations["session"]
        .items
        .is_empty()
        && Instant::now() < deadline
    {
        std::thread::sleep(Duration::from_millis(20));
    }
    (dir, engine, params, output, seen)
}

fn answer(engine: &crate::Engine, mut params: Value, decision: &str) {
    let item = engine.shared.lock().conversations["session"].items[0].clone();
    params["requestId"] = item["requestId"].clone();
    params["actionVersion"] = item["actionVersion"].clone();
    params["decisionId"] = json!(uuid::Uuid::new_v4().to_string());
    params["decision"] = json!(decision);
    engine.handle("phone", "decision.resolve", params).unwrap();
}

#[test]
fn an_unapproved_command_waits_on_a_run_card_with_the_exact_command() {
    let (_dir, engine, _params, output, _seen) = needs_approval();
    let item = engine.shared.lock().conversations["session"].items[0].clone();
    assert_eq!(item["kind"], "permission");
    assert_eq!(item["title"], "Run this app on your computer?");
    assert_eq!(item["allowLabel"], "Run");
    assert_eq!(item["choices"], json!(["decline", "accept"]));
    assert_eq!(item["scope"], "HKE");
    assert_eq!(item["detail"], "npm run rust:dev\n\ncargo run");
    assert_eq!(item["action"]["vibyraRunToken"], "plan-token");
    let mut public = item.clone();
    super::super::archive::public_item(&mut public);
    assert!(
        !public.to_string().contains("plan-token"),
        "the plan token stays private"
    );
    let answered = std::fs::read_to_string(&output).unwrap_or_default();
    assert!(answered.is_empty(), "nothing runs before the owner answers");
}

#[test]
fn declining_answers_without_running_anything() {
    let (_dir, engine, params, output, seen) = needs_approval();
    answer(&engine, params, "decline");
    let reply = &replies(&output, 1)[0];
    assert_eq!(reply["result"]["success"], false);
    assert!(reply["result"]["contentItems"][0]["text"]
        .as_str()
        .unwrap()
        .contains("declined"));
    assert_eq!(
        seen.lock().unwrap().len(),
        1,
        "no approved run was requested"
    );
}

#[test]
fn approving_runs_the_shown_plan_as_the_approving_device() {
    let (_dir, engine, params, output, seen) = needs_approval();
    answer(&engine, params, "accept");
    let reply = &replies(&output, 1)[0];
    assert_eq!(reply["result"]["success"], true);
    let approved = seen.lock().unwrap()[1].clone();
    assert_eq!(approved.approve_token.as_deref(), Some("plan-token"));
    assert_eq!(approved.device, "phone");
}

#[test]
fn a_host_without_the_run_integration_says_so() {
    let (dir, engine, _params) = setup();
    let output = fake_codex(dir.path(), &engine);
    receive(&engine.shared, "session", None, &call("npm run tauri:dev"));
    let reply = &replies(&output, 1)[0];
    assert_eq!(reply["result"]["success"], false);
}
