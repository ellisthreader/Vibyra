use super::{pump, snapshot, Sink};
use serde_json::{json, Value};
use std::{
    sync::{mpsc, Arc},
    time::{Duration, Instant},
};
use vibyra_core::pty::{FlushConfig, PtyManager};

pub(super) fn verify(engine: &vibyra_engine::Engine, session: &Value) {
    let spec = engine
        .codex_terminal(session["id"].as_str().unwrap())
        .unwrap();
    let (tx, rx) = mpsc::channel();
    let pty = PtyManager::new(Arc::new(Sink(tx)), FlushConfig::default());
    let cli = pty.create_session("codex", "Reattach", &spec).unwrap();
    let mut output = String::new();
    let start = Instant::now();
    while !output.contains("PHONE_CHAT_VERIFIED") {
        pump(&rx, &pty, cli.id, &mut output);
        assert!(
            !output.contains("CLI EXIT"),
            "Reattachment exited: {output}"
        );
        assert!(
            start.elapsed() < Duration::from_secs(20),
            "Prior thread history did not load: {output}"
        );
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        snapshot(engine, session)["items"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|i| i["role"] == "user")
            .count(),
        2
    );
    pty.write_input(cli.id,b"Use vibyra_ask_user now. Ask one question: Which color? Offer Blue and Green in that order. Wait for the answer, then reply with only the color. Do not use other tools.").unwrap();
    std::thread::sleep(Duration::from_millis(300));
    pty.write_input(cli.id, b"\r").unwrap();
    let start = Instant::now();
    let question = loop {
        pump(&rx, &pty, cli.id, &mut output);
        let state = snapshot(engine, session);
        if let Some(question) = state["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["kind"] == "question" && i["status"] == "pending")
        {
            if output.contains("Blue") && output.contains("Green") {
                break question.clone();
            }
        }
        assert!(
            start.elapsed() < Duration::from_secs(90),
            "Native question not presented: {state}\n{output}"
        );
        std::thread::sleep(Duration::from_millis(25));
    };
    let claim = engine
        .handle("phone", "session.claim", json!({"sessionId":session["id"]}))
        .unwrap();
    let answer = json!({"sessionId":session["id"],"projectId":"project","generation":claim["generation"],"lease":claim["lease"],
        "turnId":question["turnId"],"requestId":question["requestId"],"actionVersion":question["actionVersion"],
        "decisionId":uuid::Uuid::new_v4().to_string(),"answers":{question["questions"][0]["id"].as_str().unwrap():{"answers":["Blue"]}}});
    engine.handle("phone", "question.answer", answer).unwrap();
    let start = Instant::now();
    while snapshot(engine, session)["turnState"] != "completed" {
        pump(&rx, &pty, cli.id, &mut output);
        assert!(
            start.elapsed() < Duration::from_secs(60),
            "Phone answer did not finish the native question"
        );
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        snapshot(engine, session)["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["id"] == question["id"])
            .unwrap()["status"],
        "accepted"
    );
    pty.shutdown();
    eprintln!("PASS native CLI reattachment retains history; native question UI and phone answer share one acknowledged request");
}

pub(super) fn cold_resume(dir: &std::path::Path, session: &Value) {
    for _ in 0..2 {
        let engine = vibyra_engine::Engine::for_desktop_project(
            dir.join("state"),
            "project".into(),
            "CLI acceptance".into(),
            dir.to_owned(),
            "codex".into(),
            vec![],
        )
        .unwrap();
        let before = snapshot(&engine, session);
        engine
            .resume_desktop_conversation(session["id"].as_str().unwrap())
            .unwrap();
        let spec = engine
            .codex_terminal(session["id"].as_str().unwrap())
            .unwrap();
        let (tx, rx) = mpsc::channel();
        let pty = PtyManager::new(Arc::new(Sink(tx)), FlushConfig::default());
        let cli = pty.create_session("codex", "Cold resume", &spec).unwrap();
        let mut output = String::new();
        let start = Instant::now();
        while !output.contains("PHONE_CHAT_VERIFIED") {
            pump(&rx, &pty, cli.id, &mut output);
            assert!(
                !output.contains("CLI EXIT"),
                "Restored terminal exited: {output}"
            );
            assert!(
                start.elapsed() < Duration::from_secs(25),
                "Restored terminal did not render saved history: {output}"
            );
            std::thread::sleep(Duration::from_millis(25));
        }
        assert_eq!(snapshot(&engine, session)["items"], before["items"]);
        pty.shutdown();
        engine.shutdown_conversations();
        drop(engine);
        std::thread::sleep(Duration::from_millis(200));
    }
    eprintln!("PASS two cold Codex restores retain exact thread and render saved history without submitting another turn");
}
