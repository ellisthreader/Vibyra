//! Continue a conversation: `agent.sessions` lists a project's transcripts and
//! `session.create {resume}` reopens one with the agent's own `--resume`. Fake
//! `claude`/`codex` on PATH record the command line they were started with.
#![cfg(unix)]
mod support;
use serde_json::{json, Value};
use support::agents::{args, home, only_session, rig, Rig};
use uuid::Uuid;
use vibyra_host_engine::Engine;

fn folder(path: &str) -> String {
    path.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

struct Case {
    rig: Rig,
    engine: Engine,
    project: Value,
}

fn case() -> Case {
    let rig = rig();
    let engine = rig.engine("state");
    let state = engine.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(state["capabilities"]["agentHistoryV1"], true);
    let project = state["projects"][0].clone();
    Case { rig, engine, project }
}

impl Case {
    fn claude(&self, project_path: &str, text: &str) -> String {
        let id = Uuid::new_v4().to_string();
        let dir = home().join(".claude/projects").join(folder(project_path));
        std::fs::create_dir_all(&dir).unwrap();
        let line = json!({"type":"user","message":{"role":"user","content":text}});
        std::fs::write(dir.join(format!("{id}.jsonl")), format!("{line}\n")).unwrap();
        id
    }

    fn codex(&self, cwd: &str, text: &str) -> String {
        let id = Uuid::new_v4().to_string();
        let dir = home().join(".codex/sessions/2026/10/02");
        std::fs::create_dir_all(&dir).unwrap();
        let meta = json!({"type":"session_meta","payload":{"id":id,"cwd":cwd}});
        let said = json!({"type":"event_msg","payload":{"type":"user_message","message":text}});
        let file = dir.join(format!("rollout-2026-10-02T09-30-00-{id}.jsonl"));
        std::fs::write(file, format!("{meta}\n{said}\n")).unwrap();
        id
    }

    fn path(&self) -> &str {
        self.project["path"].as_str().unwrap()
    }

    fn create(&self, kind: &str, resume: Value, request: &str) -> Result<Value, String> {
        self.engine.handle(
            "phone",
            "session.create",
            json!({"projectId":self.project["id"],"title":"Continue","kind":kind,
                "requestId":request,"resume":resume}),
        )
    }
}

#[test]
fn agent_sessions_lists_only_this_projects_conversations() {
    let c = case();
    let mine = c.claude(c.path(), "Fix the build");
    c.claude("/data/projects/elsewhere", "Not mine");
    let codex = c.codex(c.path(), "Add a login page");
    c.codex("/data/projects/elsewhere", "Not mine either");
    let listed = c
        .engine
        .handle("phone", "agent.sessions", json!({"projectId":c.project["id"]}))
        .unwrap();
    let sessions = listed["sessions"].as_array().unwrap();
    let ids: Vec<&str> = sessions.iter().map(|s| s["id"].as_str().unwrap()).collect();
    assert!(ids.contains(&mine.as_str()) && ids.contains(&codex.as_str()));
    assert_eq!(sessions.len(), 2, "{listed}");
    let first = sessions.iter().find(|s| s["id"] == mine.as_str()).unwrap();
    assert_eq!((first["provider"].as_str(), first["title"].as_str()), (Some("claude"), Some("Fix the build")));
    assert!(c
        .engine
        .handle("phone", "agent.sessions", json!({"projectId":"nope"}))
        .is_err());
}

#[test]
fn a_claude_conversation_is_resumed_and_recorded_for_the_next_restart() {
    let c = case();
    let id = c.claude(c.path(), "Earlier work");
    let request = Uuid::new_v4().to_string();
    let created = c.create("claude", json!({"provider":"claude","id":id}), &request).unwrap();
    assert_eq!(created["status"], "running");
    let launched = args(&c.rig, "claude.args", 1);
    assert!(launched[0].contains(&format!("--resume {id}")), "{launched:?}");
    assert!(launched[0].contains("--permission-mode manual") && !launched[0].contains("--session-id"));
    // A retry replays the same terminal; a retry for another conversation is refused.
    let again = c.create("claude", json!({"provider":"claude","id":id}), &request).unwrap();
    assert_eq!(again["id"], created["id"]);
    let other = c.claude(c.path(), "Another");
    assert!(c.create("claude", json!({"provider":"claude","id":other}), &request).is_err());
    let restarted = c.rig.restart(c.engine, |_| {});
    let session = only_session(&restarted);
    assert_eq!(session["canResume"], true);
}

#[test]
fn a_codex_conversation_is_resumed_with_codex_resume() {
    let c = case();
    let id = c.codex(c.path(), "Earlier work");
    let created = c
        .create("codex", json!({"provider":"codex","id":id}), &Uuid::new_v4().to_string())
        .unwrap();
    assert_eq!(created["kind"], "codex");
    let launched = args(&c.rig, "codex.args", 1);
    assert!(launched[0].starts_with(&format!("resume {id} --sandbox")), "{launched:?}");
    let restarted = c.rig.restart(c.engine, |_| {});
    assert_eq!(only_session(&restarted)["canResume"], true);
}

#[test]
fn another_projects_conversation_and_hostile_requests_start_nothing() {
    let c = case();
    let theirs = c.claude("/data/projects/elsewhere", "Secret");
    let codex_theirs = c.codex("/data/projects/elsewhere", "Secret");
    let request = || Uuid::new_v4().to_string();
    for (kind, provider, id) in [
        ("claude", "claude", theirs.clone()),
        ("codex", "codex", codex_theirs),
        ("claude", "claude", Uuid::new_v4().to_string()),
    ] {
        let error = c.create(kind, json!({"provider":provider,"id":id}), &request()).unwrap_err();
        assert!(error.starts_with("resume_unavailable: "), "{error}");
    }
    let mine = c.claude(c.path(), "Mine");
    for resume in [
        json!({"provider":"claude","id":"--help"}),
        json!({"provider":"claude","id":format!("{mine};touch pwned")}),
        json!({"provider":"claude","id":"../elsewhere/x"}),
        json!({"provider":"claude; touch pwned","id":mine}),
        json!({"provider":"codex","id":mine}),
        json!({"provider":"shell","id":mine}),
        json!({"provider":"claude"}),
        json!({"id":mine}),
        json!("claude"),
    ] {
        let error = c.create("claude", resume.clone(), &request()).unwrap_err();
        assert!(!error.starts_with("resume_unavailable"), "{resume}: {error}");
    }
    assert!(c.create("shell", json!({"provider":"claude","id":mine}), &request()).is_err());
    let list = c.engine.handle("phone", "session.list", json!({})).unwrap();
    assert_eq!(list["sessionCount"], 0);
    assert!(!c.rig.project.join("claude.args").exists());
    assert!(!c.rig.project.join("pwned").exists());
}
