//! Refusals and `canResume`, without launching anything: every case here is
//! turned away (or reported) before a process would start.
use crate::{
    agent_session::{valid_id, Homes},
    codex_discovery::Schedule,
    state::{Metadata, Session},
    Engine,
};
use serde_json::{json, Value};
use std::time::Duration;

const ID: &str = "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8091";

struct Rig {
    dir: tempfile::TempDir,
    engine: Engine,
    project: String,
}

fn rig() -> Rig {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("project");
    std::fs::create_dir(&path).unwrap();
    let mut engine = Engine::new(dir.path().join("state"), vec![("Test".into(), path)]).unwrap();
    engine.homes = Homes {
        claude: dir.path().join(".claude"),
        codex: dir.path().join(".codex"),
    };
    let state = engine.handle("p", "host.state", json!({})).unwrap();
    let project = state["projects"][0]["id"].as_str().unwrap().to_owned();
    Rig {
        dir,
        engine,
        project,
    }
}

impl Rig {
    fn add(&self, sid: &str, kind: &str, status: &str, agent: Option<&str>) {
        let meta = Metadata {
            id: sid.into(),
            project_id: self.project.clone(),
            title: format!("{kind} chat"),
            kind: kind.into(),
            status: status.into(),
            created_at: "2026-10-02T09:00:00Z".into(),
            runner: None,
        };
        let mut session = Session::restored(meta, "p".into(), sid.into());
        session.agent_session_id = agent.map(str::to_owned);
        self.engine
            .shared
            .lock()
            .sessions
            .insert(sid.into(), session);
    }

    fn claude_transcript(&self, id: &str) {
        let dir = self.dir.path().join(".claude/projects/-x");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(format!("{id}.jsonl")), "{}\n").unwrap();
    }

    fn can_resume(&self, sid: &str) -> Value {
        self.engine.refresh_resumable();
        let list = self.engine.handle("p", "session.list", json!({})).unwrap();
        list["sessions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["id"] == sid)
            .unwrap()["canResume"]
            .clone()
    }

    fn resume(&self, sid: &str) -> Result<Value, String> {
        self.engine
            .handle("p", "session.resume", json!({"sessionId":sid}))
    }
}

fn typed(result: Result<Value, String>) -> String {
    let error = result.unwrap_err();
    assert!(error.starts_with("resume_unavailable: "), "{error}");
    error
}

#[test]
fn can_resume_needs_interrupted_provider_id_and_transcript() {
    let r = rig();
    let sid = |n: u8| format!("00000000-0000-4000-8000-00000000000{n}");
    r.add(&sid(1), "claude", "interrupted", Some(ID));
    r.add(&sid(2), "claude", "interrupted", None);
    r.add(&sid(3), "claude", "exited", Some(ID));
    r.add(&sid(4), "shell", "interrupted", Some(ID));
    r.add(&sid(5), "claude", "running", Some(ID));
    r.add(&sid(6), "codex", "interrupted", Some(ID));
    assert_eq!(r.can_resume(&sid(1)), false, "no transcript yet");
    r.claude_transcript(ID);
    assert_eq!(r.can_resume(&sid(1)), true);
    for n in 2..=6 {
        assert_eq!(r.can_resume(&sid(n)), false, "case {n}");
    }
    let state = r.engine.handle("p", "host.state", json!({})).unwrap();
    assert_eq!(state["capabilities"]["sessionResumeV1"], true);
    assert!(state["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .all(|s| s["canResume"].is_boolean()));
}

#[test]
fn resume_is_refused_with_a_typed_code_and_launches_nothing() {
    let r = rig();
    let sid = |n: u8| format!("00000000-0000-4000-8000-00000000000{n}");
    r.add(&sid(1), "claude", "interrupted", None);
    r.add(&sid(2), "claude", "interrupted", Some("--help"));
    r.add(&sid(3), "claude", "interrupted", Some(ID));
    r.add(&sid(4), "shell", "interrupted", Some(ID));
    r.add(&sid(5), "claude", "exited", Some(ID));
    r.add(&sid(6), "codex", "interrupted", Some(ID));
    for n in 1..=6 {
        typed(r.resume(&sid(n)));
    }
    assert!(typed(r.resume(&sid(3))).contains("no longer on this computer"));
    // A running session and an unknown one are plain errors, not "start fresh".
    r.add(&sid(7), "claude", "running", Some(ID));
    assert!(!r
        .resume(&sid(7))
        .unwrap_err()
        .starts_with("resume_unavailable"));
    assert!(!r
        .resume(&sid(8))
        .unwrap_err()
        .starts_with("resume_unavailable"));
    assert!(r.engine.handle("p", "session.resume", json!({})).is_err());
    // Nothing started: every session is exactly as it was.
    let state = r.engine.shared.lock();
    assert_eq!(state.sessions[&sid(3)].meta.status, "interrupted");
    assert!(state.sessions.values().all(|s| s.native_id.is_none()));
}

#[test]
fn only_plain_uuids_pass_the_id_check() {
    assert!(valid_id(ID));
    assert!(!valid_id("--resume"));
    assert!(!valid_id("latest"));
}

#[cfg(unix)]
#[test]
fn a_running_codex_is_identified_from_its_open_rollout_and_persisted() {
    let r = rig();
    let session = r
        .engine
        .handle(
            "p",
            "session.create",
            json!({"projectId":r.project,"title":"x","kind":"shell","requestId":"00000000-0000-4000-8000-0000000000aa"}),
        )
        .unwrap();
    let sid = session["id"].as_str().unwrap().to_owned();
    let (native, pid) = {
        let state = r.engine.shared.lock();
        let native = state.sessions[&sid].native_id.unwrap();
        (native, r.engine.ptys.process_id(native).unwrap().unwrap())
    };
    let home = r.dir.path().canonicalize().unwrap().join(".codex");
    let rollout = home.join(format!(
        "sessions/2026/10/02/rollout-2026-10-02T09-30-00-{ID}.jsonl"
    ));
    let proc = r.dir.path().join("proc");
    std::fs::create_dir_all(proc.join(format!("{pid}/fd"))).unwrap();
    std::fs::write(
        proc.join(format!("{pid}/stat")),
        format!("{pid} (codex) S 1"),
    )
    .unwrap();
    std::os::unix::fs::symlink(&rollout, proc.join(format!("{pid}/fd/5"))).unwrap();
    let mut engine = r.engine;
    engine.homes.codex = home;
    let schedule = Schedule {
        quick: Duration::from_millis(20),
        quick_for: Duration::from_secs(5),
        slow: Duration::from_millis(20),
        give_up: Duration::from_secs(8),
    };
    engine.watch_codex(sid.clone(), native, proc, schedule);
    let found = |engine: &Engine| engine.shared.lock().sessions[&sid].agent_session_id.clone();
    let deadline = std::time::Instant::now() + Duration::from_secs(6);
    while found(&engine).is_none() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(found(&engine).as_deref(), Some(ID));
    let saved = engine.shared.lock().journal.restore().unwrap();
    assert_eq!(saved[&sid].agent_session_id.as_deref(), Some(ID));
}
