//! What each AI CLI accepts on its command line.
//!
//! Kept apart from `terminal_launch`, which decides *when* to apply these:
//! this file is only the per-agent vocabulary, and everything a caller can
//! influence is validated here before it becomes an argument.

use vibyra_core::CoreError;

use super::terminal_launch::invalid;

/// Claude accepts a caller-assigned UUID; Codex IDs are discovered from the process.
pub fn pin_session(agent: &str, session: &str, args: &mut Vec<String>) {
    if agent == "claude" {
        args.extend(["--session-id".into(), session.into()]);
    }
}

/// Exact IDs resume exact chats. Older panes use a chooser, never recency.
/// Gemini's bare --resume means latest, so without an ID it opens normally;
/// the recovery UI tells the user to select the chat with /resume.
pub fn add_resume(agent: &str, session: Option<&str>, args: &mut Vec<String>) {
    match (agent, session) {
        ("claude", Some(session)) => args.extend(["--resume".into(), session.into()]),
        ("claude", None) => args.push("--resume".into()),
        ("codex", Some(session)) => args.extend(["resume".into(), session.into()]),
        ("codex", None) => args.push("resume".into()),
        ("gemini", Some(session)) => args.extend(["--resume".into(), session.into()]),
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
