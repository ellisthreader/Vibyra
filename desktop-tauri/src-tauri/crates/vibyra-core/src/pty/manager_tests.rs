use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;

use super::{FlushConfig, LaunchSpec, OutputSink, PtyManager, SessionId, Visibility};

#[derive(Default)]
struct TestSink {
    output: Mutex<HashMap<SessionId, String>>,
    resyncs: Mutex<Vec<SessionId>>,
    exits: Mutex<Vec<(SessionId, Option<i32>)>>,
}

impl OutputSink for TestSink {
    fn on_output(&self, id: SessionId, data: String) {
        self.output.lock().entry(id).or_default().push_str(&data);
    }

    fn on_resync(&self, id: SessionId, snapshot: String) {
        self.resyncs.lock().push(id);
        self.output.lock().insert(id, snapshot);
    }

    fn on_exit(&self, id: SessionId, code: Option<i32>) {
        self.exits.lock().push((id, code));
    }
}

fn wait_for(mut condition: impl FnMut() -> bool, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        if condition() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    false
}

fn shell(command: &str) -> LaunchSpec {
    LaunchSpec {
        program: "/bin/sh".into(),
        args: vec!["-c".into(), command.into()],
        env: vec![],
        env_remove: vec![],
        cwd: None,
        rows: 24,
        cols: 80,
    }
}

#[cfg(unix)]
#[test]
fn spawns_streams_and_reports_exit() {
    let sink = Arc::new(TestSink::default());
    let manager = PtyManager::new(sink.clone(), FlushConfig::default());
    let info = manager
        .create_session("shell", "test", &shell("printf 'vibyra-ok'"))
        .unwrap();
    assert!(wait_for(
        || sink
            .output
            .lock()
            .get(&info.id)
            .is_some_and(|text| text.contains("vibyra-ok")),
        Duration::from_secs(5),
    ));
    assert!(wait_for(
        || sink.exits.lock().iter().any(|(id, _)| *id == info.id),
        Duration::from_secs(5),
    ));
}

#[test]
fn fast_parallel_sessions_keep_their_own_output_and_exit() {
    const COUNT: usize = 24;
    let sink = Arc::new(TestSink::default());
    let manager = PtyManager::new(sink.clone(), FlushConfig::default());
    let sessions: Vec<_> = (0..COUNT)
        .map(|index| {
            let token = format!("terminal-{index:02}-complete");
            let info = manager
                .create_session("shell", &token, &shell(&format!("printf '{token}'")))
                .unwrap();
            (info.id, token)
        })
        .collect();

    assert!(wait_for(
        || sink.exits.lock().len() == COUNT,
        Duration::from_secs(5),
    ));
    let output = sink.output.lock();
    for (id, token) in sessions {
        let text = output
            .get(&id)
            .unwrap_or_else(|| panic!("missing output for {id}"));
        assert!(text.contains(&token), "wrong output for {id}: {text:?}");
    }
}

#[cfg(unix)]
#[test]
fn hibernated_session_is_silent_then_replays_on_wake() {
    let sink = Arc::new(TestSink::default());
    let manager = PtyManager::new(sink.clone(), FlushConfig::default());
    let info = manager
        .create_session(
            "shell",
            "test",
            &shell("sleep 0.3; printf 'while-hibernated'; sleep 2"),
        )
        .unwrap();
    manager
        .set_visibility(info.id, Visibility::Hibernated)
        .unwrap();
    std::thread::sleep(Duration::from_millis(700));
    assert!(sink
        .output
        .lock()
        .get(&info.id)
        .is_none_or(String::is_empty));
    manager
        .set_visibility(info.id, Visibility::Visible)
        .unwrap();
    assert!(wait_for(
        || sink
            .output
            .lock()
            .get(&info.id)
            .is_some_and(|text| text.contains("while-hibernated")),
        Duration::from_secs(5),
    ));
    manager.remove(info.id).unwrap();
}

#[cfg(unix)]
#[test]
fn write_input_reaches_the_process() {
    let sink = Arc::new(TestSink::default());
    let manager = PtyManager::new(sink.clone(), FlushConfig::default());
    let mut spec = shell("");
    spec.program = "/bin/cat".into();
    spec.args.clear();
    let info = manager.create_session("shell", "cat", &spec).unwrap();
    manager.write_input(info.id, b"echo-me\n").unwrap();
    assert!(wait_for(
        || sink
            .output
            .lock()
            .get(&info.id)
            .is_some_and(|text| text.contains("echo-me")),
        Duration::from_secs(5),
    ));
    manager.remove(info.id).unwrap();
}

#[cfg(unix)]
#[test]
fn explicitly_removed_parent_credentials_do_not_reach_the_pty() {
    const KEY: &str = "VIBYRA_TEST_PROVIDER_AUTH_TOKEN";
    std::env::set_var(KEY, "must-not-leak");
    let sink = Arc::new(TestSink::default());
    let manager = PtyManager::new(sink.clone(), FlushConfig::default());
    let mut spec = shell("if [ -z \"$VIBYRA_TEST_PROVIDER_AUTH_TOKEN\" ]; then printf 'isolated'; else printf 'leaked'; fi");
    spec.env_remove.push(KEY.into());
    let info = manager.create_session("codex", "test", &spec).unwrap();
    assert!(wait_for(
        || sink
            .output
            .lock()
            .get(&info.id)
            .is_some_and(|text| text.contains("isolated")),
        Duration::from_secs(5),
    ));
    assert!(!sink
        .output
        .lock()
        .get(&info.id)
        .is_some_and(|text| text.contains("leaked")));
    std::env::remove_var(KEY);
}
