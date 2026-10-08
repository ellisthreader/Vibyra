use crate::Engine;
use serde_json::json;
use std::os::unix::fs::PermissionsExt;

/// The fixture is the same tiny Agent Client Protocol agent `host/scripts/verify-acp-bridge.mjs` drives.
fn fixture(dir: &std::path::Path) -> std::path::PathBuf {
    let program = dir.join("acp-agent");
    let source = include_str!("../../../../scripts/fixtures/acp-agent.cjs");
    std::fs::write(&program, format!("#!/usr/bin/env node\n{source}")).unwrap();
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o700)).unwrap();
    program
}

fn open(dir: &std::path::Path, environment: Vec<(String, String)>) -> Result<Engine, String> {
    Engine::for_desktop_provider(
        dir.join("state"),
        "project".into(),
        "Project".into(),
        dir.into(),
        "acp".into(),
        fixture(dir),
        environment,
    )
}

#[test]
fn a_custom_acp_agent_starts_a_conversation_through_the_bridge() {
    let dir = tempfile::tempdir().unwrap();
    let env = vec![("VIBYRA_ACP_NAME".to_owned(), "Fixture agent".to_owned())];
    let engine = open(dir.path(), env).unwrap();
    let params = json!({"projectId":"project","kind":"acp","title":"Custom","requestId":"33333333-3333-4333-8333-333333333333"});
    let created = engine.create_conversation("phone", &params).unwrap();
    assert_eq!(created["status"], "running");
    let state = engine.shared.lock();
    let conversation = state.conversations.values().next().unwrap();
    assert_eq!(conversation.thread_id, "s1", "the agent's own session id");
    let started = conversation
        .runtime
        .as_ref()
        .unwrap()
        .started
        .lock()
        .clone();
    assert_eq!(started["model"], "m1", "the model the agent advertised");
    assert_eq!(started["approvalPolicy"], "on-request");
}

#[test]
fn only_the_acp_arguments_and_name_may_configure_a_custom_agent() {
    let dir = tempfile::tempdir().unwrap();
    let ok = vec![
        ("VIBYRA_ACP_ARGS".to_owned(), "[\"--acp\"]".to_owned()),
        ("VIBYRA_ACP_NAME".to_owned(), "Fixture agent".to_owned()),
    ];
    assert!(open(dir.path(), ok).is_ok());
    for key in ["OPENAI_API_KEY", "CODEX_HOME", "PATH"] {
        let error = open(dir.path(), vec![(key.to_owned(), "x".to_owned())])
            .err()
            .unwrap();
        assert!(
            error.contains("Only the selected provider"),
            "{key}: {error}"
        );
    }
}
