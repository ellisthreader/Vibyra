//! Codex adapter fixtures.
//!
//! Every line below was printed by codex-cli 0.150.1 on 2026-08-29 and then
//! trimmed of account detail. They are verbatim in shape: if a future release
//! renames a field these fail, which is the point of writing them down rather
//! than paraphrasing them.

use super::*;
use crate::agent_model::{Engine, PermissionMode};

#[test]
fn codex_names_its_thread_on_the_first_line() {
    let line = r#"{"type":"thread.started","thread_id":"01a04e27-35e5-7de0-93b4-316d33c5af7f"}"#;
    assert_eq!(
        adapter::normalize(Engine::Codex, line),
        vec![AgentEvent::SessionIdentified {
            session_id: "01a04e27-35e5-7de0-93b4-316d33c5af7f".into()
        }]
    );
}

#[test]
fn codex_agent_messages_become_completed_assistant_text() {
    let line =
        r#"{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"ok"}}"#;
    assert_eq!(
        adapter::normalize(Engine::Codex, line),
        vec![AgentEvent::AssistantCompleted { text: "ok".into() }]
    );
}

/// A shell command is two events at two moments — announced, then answered —
/// and the transcript has to be able to pair them by call id.
#[test]
fn codex_shell_commands_pair_request_with_output() {
    let started = r#"{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"echo hi","status":"in_progress"}}"#;
    let done = r#"{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"echo hi","aggregated_output":"hi\n","exit_code":0,"status":"completed"}}"#;

    assert_eq!(
        adapter::normalize(Engine::Codex, started),
        vec![AgentEvent::ToolRequested {
            call_id: "item_1".into(),
            tool: "shell".into(),
            summary: "echo hi".into(),
        }]
    );
    assert_eq!(
        adapter::normalize(Engine::Codex, done),
        vec![AgentEvent::ToolOutput {
            call_id: "item_1".into(),
            tool: "shell".into(),
            output: "hi\n".into(),
            exit_code: Some(0),
            failed: false,
        }]
    );
}

#[test]
fn codex_marks_a_non_zero_exit_as_failed() {
    let line = r#"{"type":"item.completed","item":{"id":"i","type":"command_execution","command":"false","aggregated_output":"","exit_code":1,"status":"failed"}}"#;
    let events = adapter::normalize(Engine::Codex, line);
    assert!(matches!(
        events[0],
        AgentEvent::ToolOutput { failed: true, .. }
    ));
}

/// One `file_change` item can touch several paths, and each is its own event.
#[test]
fn codex_file_changes_fan_out_one_event_per_path() {
    let line = r#"{"type":"item.completed","item":{"id":"i","type":"file_change","changes":[{"path":"/w/a.rs","kind":"update"},{"path":"/w/b.rs","kind":"add"}]}}"#;
    assert_eq!(
        adapter::normalize(Engine::Codex, line),
        vec![
            AgentEvent::FileChanged {
                path: "/w/a.rs".into(),
                change: "update".into()
            },
            AgentEvent::FileChanged {
                path: "/w/b.rs".into(),
                change: "add".into()
            },
        ]
    );
}

#[test]
fn codex_usage_folds_cached_input_into_the_input_count() {
    let line = r#"{"type":"turn.completed","usage":{"input_tokens":18366,"cached_input_tokens":11008,"output_tokens":5,"reasoning_output_tokens":0}}"#;
    assert_eq!(
        adapter::normalize(Engine::Codex, line),
        vec![AgentEvent::UsageUpdated {
            input_tokens: 29_374,
            output_tokens: 5,
            cost_usd: None,
        }]
    );
}

/// The flag split that exits 2 if it is got wrong: `exec` takes `-C`, `-s` and
/// `--add-dir`; `exec resume` takes none of them and needs a config override.
#[test]
fn codex_resume_never_passes_flags_the_subcommand_rejects() {
    let start = codex::start_args(
        "/w",
        PermissionMode::Standard,
        &["/w/extra".into()],
        None,
        None,
        &[],
    );
    assert!(start.contains(&"-s".to_string()) && start.contains(&"-C".to_string()));
    assert!(start.contains(&"--add-dir".to_string()));

    let resume = codex::resume_args("01a0-thread", PermissionMode::Standard, None, None, &[]);
    for rejected in ["-s", "-C", "--add-dir", "--last"] {
        assert!(
            !resume.contains(&rejected.to_string()),
            "`codex exec resume` rejects {rejected}; passing it exits 2"
        );
    }
    assert!(resume.contains(&"sandbox_mode=\"workspace-write\"".to_string()));
    assert!(resume.contains(&"01a0-thread".to_string()));
}

/// Full access reaches the provider's own sandbox setting, never its bypass
/// flag — the flag removes approvals too, which Vibyra's own approvals do not
/// replace on a machine that is not otherwise contained.
#[test]
fn codex_full_access_is_a_sandbox_level_not_a_bypass() {
    assert_eq!(codex::sandbox(PermissionMode::Plan), "read-only");
    assert_eq!(codex::sandbox(PermissionMode::Standard), "workspace-write");
    assert_eq!(codex::sandbox(PermissionMode::Full), "danger-full-access");
    let args = codex::start_args("/w", PermissionMode::Full, &[], None, None, &[]);
    assert!(!args
        .iter()
        .any(|arg| arg.contains("dangerously-bypass-approvals")));
}
