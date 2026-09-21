//! Opt-in acceptance against an installed, authenticated Codex; no user project
//! is opened and both turns explicitly prohibit tools/file changes.
use serde_json::{json, Value};
use std::{
    sync::{mpsc, Arc},
    time::{Duration, Instant},
};
use vibyra_core::pty::{FlushConfig, OutputSink, PtyManager};
#[path = "native_cli_recovery.rs"]
mod recovery;

struct Sink(mpsc::Sender<String>);
impl OutputSink for Sink {
    fn on_output(&self, _: u64, data: String) {
        let _ = self.0.send(data);
    }
    fn on_resync(&self, _: u64, data: String) {
        let _ = self.0.send(data);
    }
    fn on_exit(&self, _: u64, code: Option<i32>) {
        let _ = self.0.send(format!("CLI EXIT {code:?}"));
    }
}
fn snapshot(engine: &vibyra_engine::Engine, session: &Value) -> Value {
    engine
        .handle(
            "desktop",
            "conversation.snapshot",
            json!({"sessionId":session["id"]}),
        )
        .unwrap()
}
fn pump(rx: &mpsc::Receiver<String>, pty: &PtyManager, id: u64, output: &mut String) {
    for data in rx.try_iter() {
        if data.contains("\x1b[6n") {
            pty.write_input(id, b"\x1b[1;1R").unwrap();
        }
        if data.contains("\x1b[c") {
            pty.write_input(id, b"\x1b[?1;2c").unwrap();
        }
        output.push_str(&data);
    }
}
#[test]
#[ignore = "requires installed authenticated Codex and local socket/PTY permissions"]
fn native_codex_cli_shares_the_phone_conversation() {
    let dir = tempfile::tempdir().unwrap();
    let engine = vibyra_engine::Engine::for_desktop_project(
        dir.path().join("state"),
        "project".into(),
        "CLI acceptance".into(),
        dir.path().to_owned(),
        "codex".into(),
        vec![],
    )
    .unwrap();
    let session = engine
        .create_desktop_conversation(
            json!({"projectId":"project", "requestId":uuid::Uuid::new_v4().to_string(),
        "title":"Native CLI acceptance", "kind":"codex", "runner":"conversation"}),
            Default::default(),
        )
        .unwrap();
    let spec = engine
        .codex_terminal(session["id"].as_str().unwrap())
        .unwrap();
    assert_eq!(&spec.args[..2], &["resume", "--remote"]);
    assert!(spec
        .args
        .contains(&"check_for_update_on_startup=false".into()));
    let (tx, rx) = mpsc::channel();
    let pty = PtyManager::new(Arc::new(Sink(tx)), FlushConfig::default());
    let cli = pty.create_session("codex", "Acceptance", &spec).unwrap();
    let mut output = String::new();
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(15) {
        pump(&rx, &pty, cli.id, &mut output);
        if output.contains("CLI EXIT") {
            panic!("Native CLI exited before input: {output}");
        }
        if output.contains("context left") || output.contains("shortcuts") {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        !output.is_empty(),
        "The real CLI must render terminal output"
    );
    pty.write_input(
        cli.id,
        b"Reply with exactly NATIVE_CLI_VERIFIED. Do not use tools or inspect files.",
    )
    .unwrap();
    std::thread::sleep(Duration::from_millis(300));
    pty.write_input(cli.id, b"\r").unwrap();
    let start = Instant::now();
    loop {
        pump(&rx, &pty, cli.id, &mut output);
        let state = snapshot(&engine, &session);
        if state["turnState"] == "completed" {
            break;
        }
        assert!(
            start.elapsed() < Duration::from_secs(90),
            "CLI turn did not finish: {state}\n{output}"
        );
        assert!(!output.contains("CLI EXIT"), "Native CLI exited: {output}");
        std::thread::sleep(Duration::from_millis(25));
    }
    let state = snapshot(&engine, &session);
    let items = state["items"].as_array().unwrap();
    assert_eq!(items.iter().filter(|i| i["role"] == "user").count(), 1);
    assert!(items.iter().any(|i| i["role"] == "assistant"
        && i["text"]
            .as_str()
            .unwrap_or("")
            .contains("NATIVE_CLI_VERIFIED")));
    let claim = engine
        .handle("phone", "session.claim", json!({"sessionId":session["id"]}))
        .unwrap();
    let params = json!({"sessionId":session["id"],"projectId":"project","generation":claim["generation"],"lease":claim["lease"],
        "submissionId":uuid::Uuid::new_v4().to_string(),"text":"Reply with exactly PHONE_CHAT_VERIFIED. Do not use tools or inspect files."});
    engine
        .handle("phone", "turn.submit", params.clone())
        .unwrap();
    let start = Instant::now();
    while snapshot(&engine, &session)["turnState"] != "completed"
        || !output.contains("PHONE_CHAT_VERIFIED")
    {
        pump(&rx, &pty, cli.id, &mut output);
        assert!(
            start.elapsed() < Duration::from_secs(90),
            "Phone turn not reflected in real CLI: {output}"
        );
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        engine.handle("phone", "turn.submit", params).unwrap()["status"],
        "accepted"
    );
    assert_eq!(
        snapshot(&engine, &session)["items"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|i| i["role"] == "user")
            .count(),
        2
    );
    pty.remove(cli.id).unwrap();
    assert_eq!(
        snapshot(&engine, &session)["processState"],
        "running",
        "Closing a presentation must not kill the engine"
    );
    recovery::verify(&engine, &session);
    engine.shutdown_conversations();
    pty.shutdown();
    drop(engine);
    std::thread::sleep(Duration::from_millis(200));
    recovery::cold_resume(dir.path(), &session);
    eprintln!("PASS genuine Codex CLI input and phone chat share one thread, no duplicate messages, presentation lifetime independent");
}
