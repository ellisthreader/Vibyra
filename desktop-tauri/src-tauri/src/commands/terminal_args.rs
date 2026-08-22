//! What each AI CLI accepts on its command line.
//!
//! Kept apart from `terminal_launch`, which decides *when* to apply these:
//! this file is only the per-agent vocabulary, and everything a caller can
//! influence is validated here before it becomes an argument.

use vibyra_core::CoreError;

use super::terminal_launch::invalid;

/// Gives a new pane its own conversation, so resuming it later can name that
/// one rather than "whichever is newest in this folder". Only Claude Code
/// accepts an id at launch *and* resumes by it; Gemini takes one but cannot
/// resume by it, and Codex takes none, so neither is worth pinning.
pub fn pin_session(agent: &str, session: &str, args: &mut Vec<String>) {
    if agent == "claude" {
        args.extend(["--session-id".into(), session.into()]);
    }
}

/// Asks an agent to continue the conversation it was last in.
///
/// With an id it names that conversation exactly, and `--resume` keeps the id
/// (only `--fork-session` changes it), so a pane survives any number of
/// resumes. Without one the best available is recency — the frontend only asks
/// for that when no sibling pane could mean the same thing.
///
/// Unlike full access and reasoning effort, an unsupported agent is **not** an
/// error: resuming a plain shell, an SSH session or a custom CLI is a normal
/// thing to do, it simply relaunches. The recency forms below cope with there
/// being no previous conversation too — verified against claude 2.1.237, codex
/// 0.144.6 and gemini: each falls back to starting a fresh session.
///
/// **Naming an id does not.** `claude --resume <id>` reports `No conversation
/// found with session ID: …` and exits 1, so the caller must know the
/// conversation exists before asking for it; see `agent_conversations`.
pub fn add_resume(agent: &str, session: Option<&str>, args: &mut Vec<String>) {
    match (agent, session) {
        ("claude", Some(session)) => args.extend(["--resume".into(), session.into()]),
        ("claude", None) => args.push("--continue".into()),
        ("codex", _) => args.extend(["resume".into(), "--last".into()]),
        ("gemini", _) => args.extend(["--resume".into(), "latest".into()]),
        _ => {}
    }
}

/// A conversation id reaches a command line, so it is held to a plain UUID
/// rather than trusted — the same rule `validate_model` applies for the same
/// reason.
pub fn validate_session_id(session: &str) -> Result<&str, CoreError> {
    let shape = session.len() == 36
        && session.chars().enumerate().all(|(index, character)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                character == '-'
            } else {
                character.is_ascii_hexdigit()
            }
        });
    if shape {
        Ok(session)
    } else {
        Err(invalid("invalid agent session id"))
    }
}

pub fn validate_model(model: &str) -> Result<(), CoreError> {
    let valid = !model.is_empty()
        && model.len() <= 200
        && !model.starts_with('-')
        && model
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_/ :".contains(character))
        && !model.contains(char::is_whitespace);
    if valid {
        Ok(())
    } else {
        Err(invalid("invalid model identifier"))
    }
}

pub fn add_full_access(agent: &str, args: &mut Vec<String>) -> Result<(), CoreError> {
    match agent {
        "claude" => args.push("--dangerously-skip-permissions".into()),
        "codex" => args.push("--dangerously-bypass-approvals-and-sandbox".into()),
        "gemini" => args.extend([
            "--approval-mode".into(),
            "yolo".into(),
            "--no-sandbox".into(),
        ]),
        _ => return Err(invalid("this agent does not support full access")),
    }
    Ok(())
}

pub fn add_reasoning_effort(
    agent: &str,
    effort: &str,
    args: &mut Vec<String>,
) -> Result<(), CoreError> {
    const EFFORTS: &[&str] = &[
        "none",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
        "ultra",
        "ultracode",
    ];
    if !EFFORTS.contains(&effort) {
        return Err(invalid("unsupported reasoning effort"));
    }
    match agent {
        "codex" => {
            let effort = if effort == "ultracode" {
                "xhigh"
            } else {
                effort
            };
            args.extend(["-c".into(), format!("model_reasoning_effort=\"{effort}\"")]);
        }
        "claude" => {
            let effort = if effort == "ultra" { "high" } else { effort };
            args.extend(["--effort".into(), effort.into()]);
        }
        _ => return Err(invalid("this agent does not support reasoning effort")),
    }
    Ok(())
}
