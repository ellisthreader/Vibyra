use super::frames::{pieces, tail, TEXT_BUDGET};
#[cfg(unix)]
use super::{backend::DesktopBackend, vault::Vault, workspace::SharedWorkspace};
use serde_json::json;
#[cfg(unix)]
use serde_json::Value;
#[cfg(unix)]
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
#[cfg(unix)]
use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
#[cfg(unix)]
use vibyra_host::Backend;
use vibyra_host::MAX_PLAINTEXT;

#[cfg(unix)]
struct Sink;
#[cfg(unix)]
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}

fn encoded(text: &str) -> usize {
    serde_json::to_string(text).unwrap().len() - 2
}

/// What an agent's truecolor repaint looks like, with every character the
/// encoder has to escape: ESC, other controls, quotes, backslashes, and
/// multi-byte text that must never be split.
fn repaint(lines: usize) -> String {
    (0..lines)
        .map(|n| format!("\x1b[38;2;91;124;250m{n:05} \"✔ │ é\" \\ \x07\t🦀\x1b[0m\r\n"))
        .collect()
}

#[test]
fn pieces_fit_one_message_each_and_join_back_exactly() {
    for text in [
        repaint(4000),
        "x".repeat(TEXT_BUDGET * 3),
        "\x1b".repeat(40_000),
    ] {
        let parts = pieces(&text);
        assert!(parts.len() > 1, "long enough to need several messages");
        assert_eq!(parts.concat(), text);
        for part in &parts {
            assert!(!part.is_empty());
            assert!(
                encoded(part) <= TEXT_BUDGET,
                "{} > {TEXT_BUDGET}",
                encoded(part)
            );
        }
        // Each piece is as full as it can be: the next character would not fit.
        let first = parts[0];
        let next = text[first.len()..].chars().next().unwrap();
        assert!(encoded(&format!("{first}{next}")) > TEXT_BUDGET);
    }
    assert_eq!(pieces("short"), vec!["short"]);
    assert!(pieces("").is_empty());
}

#[test]
fn a_tail_is_the_longest_recent_text_that_fits() {
    let text = repaint(4000);
    let end = tail(&text);
    assert!(text.ends_with(end));
    assert!(encoded(end) <= TEXT_BUDGET);
    let before = text[..text.len() - end.len()].chars().last().unwrap();
    assert!(encoded(&format!("{before}{end}")) > TEXT_BUDGET);
    assert_eq!(tail("short"), "short");
}

#[test]
fn the_largest_output_event_and_snapshot_reply_fit_the_channel() {
    let escapes = "\x1b".repeat(TEXT_BUDGET);
    let piece = pieces(&escapes)[0];
    let generation = "f".repeat(32);
    let session = format!("{generation}-{}", u64::MAX);
    let event = json!({"event":"terminal.output","seq":u64::MAX,"data":{"sessionId":session,
        "generation":generation,"output":piece,"offset":u64::MAX}});
    assert!(serde_json::to_vec(&event).unwrap().len() <= MAX_PLAINTEXT);
    let reply = json!({"id":"i".repeat(80),"ok":true,"result":{"sessionId":session,"output":piece,
        "offset":u64::MAX,"truncated":true,"generation":generation,"status":"running",
        "cols":500,"rows":200}});
    assert!(serde_json::to_vec(&reply).unwrap().len() <= MAX_PLAINTEXT);
}

/// The phone's step after "Connecting securely". A Mac terminal that had
/// already printed more than one message's worth used to end the connection
/// there, and opening it came back "Result exceeds remote frame limit".
#[cfg(unix)]
#[test]
fn a_busy_terminal_streams_and_opens_within_the_message_limit() {
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let burst = "i=0; while [ $i -lt 3000 ]; do \
        printf '\\033[38;2;91;124;250m%05d a truecolor line for the phone\\033[0m\\n' $i; \
        i=$((i+1)); done";
    let script = format!("{burst}; echo BEFORE_END; read go; {burst}; echo AFTER_END; read done");
    let spec = LaunchSpec {
        program: "/bin/sh".into(),
        args: vec!["-c".into(), script],
        env: vec![],
        env_remove: vec![],
        cwd: None,
        rows: 30,
        cols: 100,
    };
    let pty = manager
        .create_session("shell", "Busy agent", &spec)
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    let held = loop {
        let (output, offset, _) = manager.remote_snapshot(pty.id).unwrap();
        if output.contains("BEFORE_END") {
            break offset;
        }
        assert!(Instant::now() < deadline, "the terminal never printed");
        std::thread::sleep(Duration::from_millis(20));
    };
    assert!(held > 150_000, "more than two messages' worth: {held}");
    let backend = DesktopBackend::new(
        manager.clone(),
        SharedWorkspace::default(),
        Default::default(),
        Vault::empty(),
        Default::default(),
    )
    .unwrap();
    let id = backend.handle("phone", "host.state", json!({})).unwrap()["sessions"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let events = backend.subscribe();
    // Joined up from the offset the phone would have snapshotted at.
    let (mut at, mut streamed, mut resynced) = (held, String::new(), false);
    let mut take = |event: Value| {
        let size = serde_json::to_vec(&event).unwrap().len();
        assert!(size <= MAX_PLAINTEXT, "{} of {size} bytes", event["event"]);
        let data = &event["data"];
        match event["event"].as_str().unwrap() {
            "terminal.resync" => {
                assert!(!resynced, "only the first sight is flagged");
                resynced = true;
            }
            "terminal.output" => {
                let output = data["output"].as_str().unwrap();
                let offset = data["offset"].as_u64().unwrap();
                assert_eq!(
                    offset - output.len() as u64,
                    at,
                    "pieces join without a gap"
                );
                at = offset;
                streamed.push_str(output);
            }
            _ => {}
        }
        (resynced, streamed.contains("AFTER_END"))
    };
    let until = |take: &mut dyn FnMut(Value) -> (bool, bool), done: fn((bool, bool)) -> bool| {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            assert!(Instant::now() < deadline, "the phone's stream stalled");
            if let Ok(event) = events.recv_timeout(Duration::from_millis(250)) {
                if done(take(event)) {
                    return;
                }
            }
        }
    };
    until(&mut take, |(resynced, _)| resynced);
    manager.write_input(pty.id, b"\n").unwrap();
    until(&mut take, |(_, finished)| finished);
    // Whatever the last read held back; heartbeats keep coming, so this is a
    // settle time rather than waiting for silence.
    let settled = Instant::now() + Duration::from_millis(600);
    while Instant::now() < settled {
        if let Ok(event) = events.recv_timeout(Duration::from_millis(50)) {
            take(event);
        }
    }
    assert!(
        !streamed.contains("BEFORE_END"),
        "its history is not resent"
    );
    assert!(streamed.len() > 150_000);

    let snapshot = backend
        .handle("phone", "session.snapshot", json!({"sessionId":id}))
        .unwrap();
    let reply = json!({"id":"8d9f7c1e-0000-4000-8000-000000000001","ok":true,"result":snapshot});
    assert!(
        serde_json::to_vec(&reply).unwrap().len() <= MAX_PLAINTEXT,
        "opening this terminal must fit one message"
    );
    assert!(snapshot["output"].as_str().unwrap().contains("AFTER_END"));
    assert_eq!(snapshot["truncated"], true);
    assert_eq!(snapshot["offset"].as_u64(), Some(at));
    manager.shutdown();
}
