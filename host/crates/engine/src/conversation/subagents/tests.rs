use super::read;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
const ROOT: &str = "11111111-1111-4111-8111-111111111111";
const CHILD: &str = "22222222-2222-4222-8222-222222222222";
const NESTED: &str = "33333333-3333-4333-8333-333333333333";
fn folder() -> PathBuf {
    let p = std::env::temp_dir().join(format!("vibyra-chat-subagents-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&p).unwrap();
    p
}
fn write(path: &Path, rows: &[Value]) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(
        path,
        rows.iter()
            .map(|row| format!("{row}\n"))
            .collect::<String>(),
    )
    .unwrap();
}
fn meta(id: &str, owner: Option<&str>) -> Value {
    let mut v = json!({"type":"session_meta","timestamp":"2026-10-01T10:00:00Z","payload":{"id":id,"agent_nickname":"Ada","agent_path":"/root/layout_review"}});
    if let Some(owner) = owner {
        v["payload"]["source"] = json!({"subagent":{"thread_spawn":{"parent_thread_id":owner}}});
    }
    v
}
fn rollout(root: &Path, day: &str, id: &str, owner: Option<&str>) -> PathBuf {
    let path = root.join(day).join(format!("rollout-test-{id}.jsonl"));
    let mut head = meta(id, owner);
    head["payload"]["instructions"] = json!("x".repeat(12_000));
    write(
        &path,
        &[
            head,
            json!({"type":"event_msg","timestamp":"2026-10-01T10:00:02Z","payload":{"type":"task_started"}}),
            json!({"type":"response_item","timestamp":"2026-10-01T10:00:05Z","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"npm test\"}"}}),
        ],
    );
    path
}
#[test]
fn subagents_scope_modern_nested_resumed_and_incremental_completion() {
    let root = folder();
    rollout(&root, "2026/10/01", ROOT, None);
    let child = rollout(&root, "2026/10/07", CHILD, Some(ROOT));
    rollout(&root, "2026/10/07", NESTED, Some(CHILD));
    rollout(
        &root,
        "2026/10/07",
        "44444444-4444-4444-8444-444444444444",
        Some("55555555-5555-4555-8555-555555555555"),
    );
    let value = read("codex", ROOT, &root);
    let agents = value["agents"].as_array().unwrap();
    assert_eq!(agents.len(), 2);
    assert!(agents
        .iter()
        .all(|a| a["state"] == "running" && a["doing"] == "Running npm test"));
    let mut text = std::fs::read_to_string(&child).unwrap();
    text.push_str(&format!("{}\n", json!({"type":"event_msg","timestamp":"2026-10-01T10:02:00Z","payload":{"type":"task_complete"}})));
    std::fs::write(child, text).unwrap();
    assert_eq!(
        read("codex", ROOT, &root)["agents"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["id"] == CHILD)
            .unwrap()["state"],
        "done"
    );
    assert!(read("codex", "../other", &root)["unavailable"].is_string());
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn subagents_claude_profile_and_parent_completion() {
    let root = folder();
    let main = root.join("project").join(format!("{ROOT}.jsonl"));
    write(
        &main,
        &[
            json!({"type":"assistant","timestamp":"2026-10-01T10:00:00Z","message":{"content":[{"type":"tool_use","id":"tool-1","name":"Agent","input":{}}]}}),
        ],
    );
    let child = root
        .join("project")
        .join(ROOT)
        .join("subagents/agent-review.jsonl");
    write(
        &child,
        &[
            json!({"type":"assistant","timestamp":"2026-10-01T10:01:00Z","message":{"model":"claude-opus","content":[{"type":"tool_use","name":"Read","input":{"file_path":"/app/main.ts"}}]}}),
        ],
    );
    std::fs::write(
        child.with_extension("meta.json"),
        json!({"description":"Review layout","agentType":"Explore","toolUseId":"tool-1"})
            .to_string(),
    )
    .unwrap();
    let value = read("claude", ROOT, &root);
    assert_eq!(value["agents"][0]["name"], "Review layout");
    assert_eq!(value["agents"][0]["state"], "running");
    let mut text = std::fs::read_to_string(&main).unwrap();
    text.push_str(&format!("{}\n", json!({"type":"user","timestamp":"2026-10-01T10:02:00Z","message":{"content":[{"type":"tool_result","tool_use_id":"tool-1","content":"Done"}]}})));
    std::fs::write(main, text).unwrap();
    assert_eq!(read("claude", ROOT, &root)["agents"][0]["state"], "done");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn subagents_rpc_uses_the_selected_account_and_thread_without_input_control() {
    use crate::{
        conversation::model::Conversation,
        state::{Metadata, Session},
        Engine,
    };
    let dir = tempfile::tempdir().unwrap();
    let account = dir.path().join("account");
    let root = account.join("sessions");
    rollout(&root, "2026/10/01", ROOT, None);
    rollout(&root, "2026/10/07", CHILD, Some(ROOT));
    let engine = Engine::for_desktop_project(
        dir.path().join("state"),
        "project".into(),
        "Project".into(),
        dir.path().to_path_buf(),
        "codex".into(),
        vec![("CODEX_HOME".into(), account.to_string_lossy().into_owned())],
    )
    .unwrap();
    let mut state = engine.shared.lock();
    let session = Session::restored(
        Metadata {
            id: "chat".into(),
            project_id: "project".into(),
            title: "Chat".into(),
            kind: "codex".into(),
            status: "running".into(),
            created_at: crate::now(),
            runner: Some("conversation".into()),
        },
        "desktop".into(),
        "create".into(),
    );
    let mut conversation = Conversation::new(session.generation.clone());
    conversation.thread_id = ROOT.into();
    state.sessions.insert("chat".into(), session);
    state.conversations.insert("chat".into(), conversation);
    drop(state);
    let result = engine
        .handle(
            "phone",
            "conversation.subagents",
            json!({"sessionId":"chat","threadId":"another-thread","path":"/not-the-account"}),
        )
        .unwrap();
    assert_eq!(result["agents"][0]["id"], CHILD);
    assert!(engine
        .handle(
            "phone",
            "conversation.subagents",
            json!({"sessionId":"missing"})
        )
        .is_err());
}
