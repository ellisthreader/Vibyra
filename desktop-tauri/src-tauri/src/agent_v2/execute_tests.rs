//! Runs `execute` against a fake `claude` (a native Node process speaking the same
//! stream-json control protocol) and a recording backend.

use super::*;
use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::agent_v2::provider_fixture_tests as fixture;
const FAKE: &str = include_str!("execute_fixture.cjs");

const INIT_OK: &str = r#"{"type":"system","subtype":"init","tools":["mcp__vibyra-broker__gmail_search"],"mcp_servers":[{"name":"vibyra-broker","status":"connected"}],"apiKeySource":"none","model":"m","claude_code_version":"2.1.285"}"#;
const DELTA: &str = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Two emails."}}}"#;
const RESULT: &str =
    r#"{"type":"result","subtype":"success","is_error":false,"result":"Two emails."}"#;

#[derive(Default)]
struct Recorder {
    calls: Mutex<Vec<String>>,
    refuse_events: Option<&'static str>,
}

impl Recorder {
    fn log(&self, entry: String) {
        self.calls.lock().unwrap().push(entry);
    }
}

impl Backend for Recorder {
    fn events(&self, events: &[(&str, String)]) -> Result<(), ApiError> {
        self.log(format!("events:{}", events[0].1));
        let refusal = |code: &str| ApiError::Refused {
            status: 409,
            code: code.into(),
            message: String::new(),
        };
        self.refuse_events.map_or(Ok(()), |code| Err(refusal(code)))
    }
    fn complete(&self, answer: &str) -> Result<(), ApiError> {
        self.log(format!("complete:{answer}"));
        Ok(())
    }
    fn fail(&self, code: &str, reason: &str) -> Result<(), ApiError> {
        self.log(format!("fail:{code}:{reason}"));
        Ok(())
    }
    fn pause(&self, _reason: &str, resume_at: Option<i64>) -> Result<(), ApiError> {
        self.log(format!("pause:{resume_at:?}"));
        Ok(())
    }
}

fn plan(dir: &Path, lines: &[&str], extra_env: &[(&str, &str)]) -> Plan {
    let script = dir.join("claude.cjs");
    std::fs::write(&script, FAKE).unwrap();
    let out = dir.join("out.jsonl");
    std::fs::write(
        &out,
        lines.iter().map(|l| format!("{l}\n")).collect::<String>(),
    )
    .unwrap();
    let mut env = vec![("FAKE_OUT".to_owned(), out.to_string_lossy().into_owned())];
    env.extend(
        extra_env
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string())),
    );
    Plan {
        launch: Launch {
            program: fixture::node(),
            args: vec![script.to_string_lossy().into_owned()],
            env,
            cwd: dir.into(),
        },
        prompt: "What is new?".into(),
        attachments: Vec::new(),
        expected_tools: vec!["mcp__vibyra-broker__gmail_search".into()],
        armed_path: dir.join("armed"),
        wall: Duration::from_secs(20),
        interrupt_grace: Duration::from_millis(700),
    }
}

fn calls(backend: &Recorder) -> Vec<String> {
    backend.calls.lock().unwrap().clone()
}

#[test]
fn a_gated_run_streams_deltas_and_completes_with_the_answer() {
    let dir = tempfile::tempdir().unwrap();
    let plan = plan(dir.path(), &[INIT_OK, DELTA, RESULT], &[]);
    let backend = Recorder::default();
    assert_eq!(
        execute(&plan, &backend, &Control::default()),
        Outcome::Completed
    );
    assert_eq!(
        calls(&backend),
        ["events:Two emails.", "complete:Two emails."]
    );
    assert!(plan.armed_path.exists());
}

#[test]
fn a_tool_surface_beyond_the_manifest_fails_the_run_before_arming() {
    let dir = tempfile::tempdir().unwrap();
    let init = INIT_OK.replace(r#""tools":["#, r#""tools":["Bash","#);
    let plan = plan(dir.path(), &[&init, DELTA, RESULT], &[]);
    let backend = Recorder::default();
    assert_eq!(
        execute(&plan, &backend, &Control::default()),
        Outcome::Failed("provider_error".into())
    );
    let calls = calls(&backend);
    assert_eq!(calls.len(), 1);
    assert!(calls[0].starts_with("fail:provider_error:") && calls[0].contains("Bash"));
    assert!(!plan.armed_path.exists());
}

#[test]
fn cancel_sends_an_interrupt_and_posts_nothing_more() {
    let dir = tempfile::tempdir().unwrap();
    let plan = plan(dir.path(), &[INIT_OK], &[]);
    let backend = Recorder::default();
    let control = Arc::new(Control::default());
    let flag = control.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(600));
        flag.cancel.store(true, Ordering::SeqCst);
    });
    let started = Instant::now();
    assert_eq!(execute(&plan, &backend, &control), Outcome::Cancelled);
    assert!(started.elapsed() < plan.interrupt_grace + Duration::from_secs(2));
    assert!(calls(&backend).is_empty());
}

#[test]
fn an_ignored_interrupt_falls_back_to_killing_the_process() {
    let dir = tempfile::tempdir().unwrap();
    let plan = plan(dir.path(), &[INIT_OK], &[("FAKE_IGNORE_INTERRUPT", "1")]);
    let backend = Recorder::default();
    let control = Control::default();
    control.cancel.store(true, Ordering::SeqCst);
    let started = Instant::now();
    // Cancelled during preflight: stops before any prompt is sent.
    assert_eq!(execute(&plan, &backend, &control), Outcome::Cancelled);
    assert!(started.elapsed() < Duration::from_secs(3));
    let control = Arc::new(Control::default());
    let flag = control.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(600));
        flag.cancel.store(true, Ordering::SeqCst);
    });
    assert_eq!(execute(&plan, &backend, &control), Outcome::Cancelled);
    assert!(calls(&backend).is_empty());
}

#[test]
fn a_stale_lease_stops_at_once_and_discards_output() {
    let dir = tempfile::tempdir().unwrap();
    let plan = plan(dir.path(), &[INIT_OK, DELTA, RESULT], &[]);
    let backend = Recorder {
        refuse_events: Some("stale_lease"),
        ..Default::default()
    };
    assert_eq!(
        execute(&plan, &backend, &Control::default()),
        Outcome::Stale
    );
    assert_eq!(calls(&backend), ["events:Two emails."]);
    let control = Control::default();
    control.stale.store(true, Ordering::SeqCst);
    let quiet = Recorder::default();
    assert_eq!(execute(&plan, &quiet, &control), Outcome::Stale);
    assert!(calls(&quiet).is_empty());
}

#[path = "execute_complete_tests.rs"]
mod completes;
#[path = "execute_wait_tests.rs"]
mod waits;
