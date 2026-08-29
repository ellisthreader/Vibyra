//! Claude Code, as a structured chat.
//!
//! Verified against **claude 2.1.251** on 2026-08-29 with
//! `claude -p --output-format stream-json --verbose`, which prints:
//!
//! ```text
//! {"type":"system","subtype":"init","session_id":"5de3be37-…","model":"…"}
//! {"type":"assistant","message":{"content":[{"type":"text","text":"ok"}]}}
//! {"type":"result","subtype":"success","result":"ok","total_cost_usd":0.19}
//! ```
//!
//! The session contract, checked both ways rather than assumed:
//!
//! * `--session-id <uuid>` at launch *pins* the conversation to an id Vibyra
//!   chose, so a chat is addressable from its very first turn — before the
//!   provider has told us anything.
//! * `--resume <uuid>` continues it and **keeps the same id**. Only
//!   `--fork-session` mints a new one, and it is never passed here.
//!
//! `--dangerously-skip-permissions` is not used for anything, including Full
//! access. It removes the permission layer entirely; `acceptEdits` gives the
//! agent the writes the user actually granted and leaves the rest asking.

use crate::agent_model::PermissionMode;

/// The `--permission-mode` value for a level.
///
/// `plan` and `acceptEdits` are Claude's own names. `Standard` maps to
/// `acceptEdits` — edits inside granted directories go through, everything
/// with an outward effect still stops — and `Full` maps to the same mode
/// rather than to a bypass, because the difference Vibyra means by "full" is
/// which places are on `--add-dir`, not whether permissions exist.
pub fn permission_mode(permission: PermissionMode) -> &'static str {
    match permission {
        PermissionMode::Plan => "plan",
        PermissionMode::Standard | PermissionMode::Full => "acceptEdits",
    }
}

/// Arguments for a turn.
///
/// `session` is the id to pin (first turn) or resume (every turn after), and
/// `resume` says which. Both name the same id, which is what makes a chat's
/// whole life one conversation.
///
/// `--verbose` is not optional here: without it `-p --output-format
/// stream-json` refuses to run. The prompt goes on stdin for the same reason
/// as Codex's — a prompt beginning with a dash is text, not a flag.
pub fn turn_args(
    session: &str,
    resume: bool,
    permission: PermissionMode,
    places: &[String],
    model: Option<&str>,
    effort: Option<&str>,
    system_prompt: Option<&str>,
) -> Vec<String> {
    let mut args = vec![
        "-p".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--permission-mode".into(),
        permission_mode(permission).into(),
    ];
    if resume {
        args.extend(["--resume".into(), session.into()]);
    } else {
        args.extend(["--session-id".into(), session.into()]);
    }
    for place in places {
        args.extend(["--add-dir".into(), place.clone()]);
    }
    if let Some(model) = model {
        args.extend(["--model".into(), model.into()]);
    }
    if let Some(effort) = effort {
        args.extend(["--effort".into(), effort.into()]);
    }
    if let Some(prompt) = system_prompt {
        args.extend(["--append-system-prompt".into(), prompt.into()]);
    }
    args
}
