//! Claude Code adapter fixtures.
//!
//! Captured from claude 2.1.251 on 2026-08-29, verbatim in shape for the same
//! reason as the Codex set next door.

use super::*;
use crate::agent_model::{Engine, PermissionMode};

#[test]
fn claude_init_names_the_session() {
    let line = r#"{"type":"system","subtype":"init","session_id":"5de3be37-cabb-4ee9-81ea-b77242cbf3f3","model":"claude-fable-5"}"#;
    assert_eq!(
        adapter::normalize(Engine::Claude, line),
        vec![AgentEvent::SessionIdentified {
            session_id: "5de3be37-cabb-4ee9-81ea-b77242cbf3f3".into()
        }]
    );
}

/// One assistant message can hold thinking, text and a tool call at once.
#[test]
fn claude_splits_one_message_into_its_content_blocks() {
    let line = r#"{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"weighing it"},{"type":"text","text":"Reading the file."},{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"/w/a.rs"}}]}}"#;
    let events = adapter::normalize(Engine::Claude, line);
    assert_eq!(events.len(), 3);
    assert_eq!(
        events[0],
        AgentEvent::ReasoningSummary {
            text: "weighing it".into()
        }
    );
    assert_eq!(
        events[1],
        AgentEvent::AssistantCompleted {
            text: "Reading the file.".into()
        }
    );
    assert!(
        matches!(&events[2], AgentEvent::ToolRequested { tool, call_id, .. }
        if tool == "Read" && call_id == "toolu_1")
    );
}

#[test]
fn claude_tool_results_answer_the_call_they_belong_to() {
    let line = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"fn main() {}","is_error":false}]}}"#;
    assert_eq!(
        adapter::normalize(Engine::Claude, line),
        vec![AgentEvent::ToolOutput {
            call_id: "toolu_1".into(),
            tool: String::new(),
            output: "fn main() {}".into(),
            exit_code: None,
            failed: false,
        }]
    );
}

#[test]
fn claude_result_carries_usage_and_cost_then_completes_the_turn() {
    let line = r#"{"type":"result","subtype":"success","result":"ok","is_error":false,"total_cost_usd":0.198287,"usage":{"input_tokens":2,"cache_creation_input_tokens":9350,"cache_read_input_tokens":10125,"output_tokens":4}}"#;
    let events = adapter::normalize(Engine::Claude, line);
    assert_eq!(
        events[0],
        AgentEvent::UsageUpdated {
            input_tokens: 19_477,
            output_tokens: 4,
            cost_usd: Some(0.198_287),
        }
    );
    assert_eq!(
        events[1],
        AgentEvent::TurnCompleted {
            result: "ok".into()
        }
    );
}

#[test]
fn claude_an_errored_result_fails_the_turn_rather_than_completing_it() {
    let line = r#"{"type":"result","subtype":"error_during_execution","is_error":true,"result":"the tool refused"}"#;
    let events = adapter::normalize(Engine::Claude, line);
    assert_eq!(
        events[1],
        AgentEvent::TurnFailed {
            message: "the tool refused".into()
        }
    );
}

/// Pinning on the first turn and resuming on the next must name the *same*
/// id — that is what makes a chat one conversation for its whole life.
#[test]
fn claude_pins_then_resumes_the_same_conversation() {
    let shape = |resume| claude::TurnShape {
        session: "sess-1",
        resume,
        permission: PermissionMode::Standard,
        places: &[],
        model: None,
        effort: None,
        system_prompt: None,
        bridged: true,
    };
    let first = claude::turn_args(shape(false));
    let later = claude::turn_args(shape(true));

    assert!(first.windows(2).any(|w| w == ["--session-id", "sess-1"]));
    assert!(later.windows(2).any(|w| w == ["--resume", "sess-1"]));
    assert!(
        !later.contains(&"--fork-session".to_string()),
        "forking changes the id"
    );
    for args in [&first, &later] {
        assert!(
            args.contains(&"--verbose".to_string()),
            "stream-json requires it"
        );
        assert!(!args
            .iter()
            .any(|a| a.contains("dangerously-skip-permissions")));
    }
}

/// The mapping the whole decision queue rests on.
///
/// `acceptEdits` never consults the permission-prompt tool — checked against
/// claude 2.1.258 with a real `rm -f`, which ran unasked — so a bridged turn
/// has to be `manual` or Vibyra is never told anything and Decisions stays
/// empty. Unbridged it goes back to `acceptEdits`, because `manual` with no
/// tool to ask denies every call and the turn does nothing at all.
#[test]
fn claude_plan_mode_is_the_providers_own_plan_mode() {
    for bridged in [true, false] {
        assert_eq!(
            claude::permission_mode(PermissionMode::Plan, bridged),
            "plan"
        );
    }
    assert_eq!(
        claude::permission_mode(PermissionMode::Standard, true),
        "manual"
    );
    assert_eq!(
        claude::permission_mode(PermissionMode::Full, true),
        "manual"
    );
    assert_eq!(
        claude::permission_mode(PermissionMode::Standard, false),
        "acceptEdits"
    );
    assert_eq!(
        claude::permission_mode(PermissionMode::Full, false),
        "acceptEdits"
    );
}

/// The bridge rides on two flags and nothing on disk: the tool name Claude
/// consults, and an inline server definition whose env names the running app.
#[test]
fn claude_permission_prompts_are_routed_through_the_bridge() {
    let args = claude::bridge_args(&claude::PermissionBridge {
        exe: "/opt/vibyra/vibyra-desktop".into(),
        port: 43_210,
        token: "tok".into(),
        chat_id: "chat-1".into(),
        turn_id: "turn-1".into(),
    });
    assert_eq!(args[0], "--permission-prompt-tool");
    assert_eq!(args[1], "mcp__vibyra__approve");
    assert_eq!(args[2], "--mcp-config");
    let config: serde_json::Value = serde_json::from_str(&args[3]).unwrap();
    let server = &config["mcpServers"]["vibyra"];
    assert_eq!(server["command"], "/opt/vibyra/vibyra-desktop");
    assert_eq!(server["args"][0], "--permission-bridge");
    assert_eq!(server["env"]["VIBYRA_BRIDGE_PORT"], "43210");
    assert_eq!(server["env"]["VIBYRA_BRIDGE_TOKEN"], "tok");
    assert_eq!(server["env"]["VIBYRA_BRIDGE_CHAT"], "chat-1");
    assert_eq!(server["env"]["VIBYRA_BRIDGE_TURN"], "turn-1");
    assert_eq!(args.len(), 4);
}
