//! What both adapters have to agree on.
//!
//! Per-provider fixtures live in `codex_tests` and `claude_tests`. What is
//! here is the shared contract: an unknown line is nothing, a delta is not
//! history, output is bounded, and context reaches each engine through the
//! channel that engine actually has.

use super::*;
use crate::agent_model::{Engine, PermissionMode};

/// A line neither adapter understands is nothing, not a crash. A newer CLI
/// adding an event type must not break a chat that is mid-turn.
#[test]
fn an_unknown_or_malformed_line_is_ignored_by_both() {
    for engine in [Engine::Claude, Engine::Codex] {
        assert!(adapter::normalize(engine, "not json at all").is_empty());
        assert!(adapter::normalize(engine, r#"{"type":"something.new"}"#).is_empty());
        assert!(adapter::normalize(engine, "").is_empty());
    }
}

/// Deltas exist to make typing feel live and are worthless once the completed
/// message arrives carrying the same text. Everything else is history.
#[test]
fn only_streaming_deltas_are_kept_out_of_the_transcript() {
    assert!(!AgentEvent::AssistantDelta { text: "par".into() }.persisted());
    for event in [
        AgentEvent::AssistantCompleted {
            text: "partial".into(),
        },
        AgentEvent::SessionIdentified {
            session_id: "s".into(),
        },
        AgentEvent::UsageUpdated {
            input_tokens: 1,
            output_tokens: 1,
            cost_usd: None,
        },
    ] {
        assert!(event.persisted(), "{} must be kept", event.kind());
    }
}

/// A tool that prints a megabyte costs one truncated row, not a database.
#[test]
fn runaway_output_is_truncated_on_a_character_boundary() {
    let huge = "é".repeat(events::MAX_TEXT);
    let bounded = AgentEvent::ToolOutput {
        call_id: "c".into(),
        tool: "shell".into(),
        output: huge,
        exit_code: Some(0),
        failed: false,
    }
    .bounded();
    let AgentEvent::ToolOutput { output, .. } = bounded else {
        panic!("shape changed");
    };
    assert!(output.len() < events::MAX_TEXT + 200);
    assert!(output.contains("more bytes not shown"));
}

/// Codex has no system-prompt channel on `exec`, so its context is a
/// delimited block the model and a transcript reader can both see the edge of
/// — never a file written into the user's repository.
#[test]
fn codex_context_is_delimited_in_the_prompt_and_claude_uses_its_own_channel() {
    let plan = |engine| adapter::TurnPlan {
        engine,
        session: None,
        permission: PermissionMode::Standard,
        cwd: "/w".into(),
        places: vec![],
        model: None,
        effort: None,
        images: vec![],
        prompt: "ship it".into(),
        system_prompt: Some("You keep release notes honest.".into()),
        env: vec![],
        env_remove: vec![],
        bridge: None,
    };

    let codex = plan(Engine::Codex).build();
    assert!(codex.command.prompt.starts_with("<vibyra-context>"));
    assert!(codex.command.prompt.ends_with("ship it"));
    assert!(codex.session.is_none(), "Codex names its own thread, later");

    let claude = plan(Engine::Claude).build();
    assert_eq!(claude.command.prompt, "ship it");
    assert!(claude
        .command
        .args
        .windows(2)
        .any(|w| w[0] == "--append-system-prompt"));
    assert!(
        claude.session.is_some(),
        "Claude's id is known before it starts"
    );
}
