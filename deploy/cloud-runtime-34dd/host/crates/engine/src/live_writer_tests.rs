//! `agentSessionId` on session summaries, and one live writer per
//! conversation: `session.create {resume}` returns the running session.
use crate::state::{Metadata, Session};
use crate::Engine;
use serde_json::{json, Value};

const ID: &str = "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8091";

fn rig() -> (tempfile::TempDir, Engine, String) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("project");
    std::fs::create_dir(&path).unwrap();
    let mut engine = Engine::new(dir.path().join("state"), vec![("Test".into(), path)]).unwrap();
    engine.homes = crate::agent_session::Homes {
        claude: dir.path().join(".claude"),
        codex: dir.path().join(".codex"),
    };
    let state = engine.handle("p", "host.state", json!({})).unwrap();
    let project = state["projects"][0]["id"].as_str().unwrap().to_owned();
    (dir, engine, project)
}

fn add(engine: &Engine, project: &str, sid: &str, kind: &str, status: &str, agent: Option<&str>) {
    let meta = Metadata {
        id: sid.into(),
        project_id: project.into(),
        title: format!("{kind} chat"),
        kind: kind.into(),
        status: status.into(),
        created_at: "2026-10-04T09:00:00Z".into(),
        runner: None,
    };
    let mut session = Session::restored(meta, "p".into(), sid.into());
    session.agent_session_id = agent.map(str::to_owned);
    engine.shared.lock().sessions.insert(sid.into(), session);
}

fn sid(n: u8) -> String {
    format!("00000000-0000-4000-8000-00000000000{n}")
}

fn resume(engine: &Engine, project: &str, kind: &str, request: u8) -> Result<Value, String> {
    let params = json!({"projectId":project,"title":"again","kind":kind,
        "requestId":format!("00000000-0000-4000-8000-0000000000b{request}"),
        "resume":{"provider":kind,"id":ID}});
    engine.handle("p", "session.create", params)
}

#[test]
fn summaries_carry_the_agent_session_id_only_when_known_and_valid() {
    let (_dir, engine, project) = rig();
    add(
        &engine,
        &project,
        &sid(1),
        "claude",
        "interrupted",
        Some(ID),
    );
    add(&engine, &project, &sid(2), "shell", "running", None);
    add(
        &engine,
        &project,
        &sid(3),
        "claude",
        "interrupted",
        Some("--help"),
    );
    for method in ["session.list", "host.state"] {
        let list = engine.handle("p", method, json!({})).unwrap();
        let find = |id: String| {
            list["sessions"]
                .as_array()
                .unwrap()
                .iter()
                .find(|s| s["id"] == id)
                .unwrap()
                .clone()
        };
        assert_eq!(find(sid(1))["agentSessionId"], ID, "{method}");
        assert!(find(sid(2)).get("agentSessionId").is_none(), "{method}");
        assert!(find(sid(3)).get("agentSessionId").is_none(), "{method}");
    }
}

#[test]
fn resuming_a_conversation_already_running_returns_that_session() {
    let (_dir, engine, project) = rig();
    add(&engine, &project, &sid(1), "claude", "running", Some(ID));
    let result = resume(&engine, &project, "claude", 1).unwrap();
    assert_eq!(result["existing"], true);
    assert_eq!(result["sessionId"], sid(1));
    assert_eq!(result["id"], sid(1));
    assert_eq!(result["agentSessionId"], ID);
    // Nothing launched, no second record.
    let state = engine.shared.lock();
    assert_eq!(state.sessions.len(), 1);
    assert!(state.sessions.values().all(|s| s.native_id.is_none()));
}

#[test]
fn only_a_running_session_of_the_same_provider_counts() {
    let (_dir, engine, project) = rig();
    add(&engine, &project, &sid(1), "codex", "running", Some(ID));
    add(
        &engine,
        &project,
        &sid(2),
        "claude",
        "interrupted",
        Some(ID),
    );
    add(&engine, &project, &sid(3), "claude", "exited", Some(ID));
    // Falls through to the normal checks: no transcript here, so refused.
    let error = resume(&engine, &project, "claude", 2).unwrap_err();
    assert!(error.starts_with("resume_unavailable: "), "{error}");
    assert_eq!(engine.shared.lock().sessions.len(), 3);
}
