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

use std::path::PathBuf;

use crate::agent_model::PermissionMode;

/// How a turn's permission prompts reach Vibyra.
///
/// Claude is told to ask an MCP tool before any tool it cannot allow itself;
/// that tool is this same executable in `--permission-bridge` mode, and the
/// environment tells it which running app and which chat to speak for.
#[derive(Debug, Clone, PartialEq)]
pub struct PermissionBridge {
    pub exe: PathBuf,
    pub port: u16,
    pub token: String,
    pub chat_id: String,
    pub turn_id: String,
}

/// The MCP tool Claude is told to consult. `mcp__<server>__<tool>`.
pub const PROMPT_TOOL: &str = "mcp__vibyra__approve";

/// The `--permission-mode` value for a level.
///
/// `bridged` says whether Vibyra is reachable to answer permission questions,
/// and it changes the answer because the two modes ask different people.
///
/// **Bridged: `manual`.** Every tool call Claude cannot decide alone is put to
/// the prompt tool, which is Vibyra — so Vibyra's own risk policy is what
/// governs the turn. Verified against claude 2.1.258: `acceptEdits` does *not*
/// consult the prompt tool, not even for `rm -f`, so mapping Standard to it
/// meant no question ever reached the app and the Decisions queue could not
/// fill. `manual` is what makes "anything outward still asks" true.
///
/// **Unbridged: `acceptEdits`.** With no prompt tool, `manual` would deny
/// every tool call and the turn would be useless, so a gate that failed to
/// bind leaves the provider exactly as it behaved before there was one.
///
/// `Full` differs from `Standard` in which places are on `--add-dir`, not in
/// whether permissions exist: neither reaches
/// `--dangerously-skip-permissions`, which removes the layer entirely.
pub fn permission_mode(permission: PermissionMode, bridged: bool) -> &'static str {
    match permission {
        PermissionMode::Plan => "plan",
        PermissionMode::Standard | PermissionMode::Full if bridged => "manual",
        PermissionMode::Standard | PermissionMode::Full => "acceptEdits",
    }
}

/// Everything a turn's arguments are built from.
///
/// A struct rather than eight positional parameters: the two booleans sat
/// next to each other and read identically at the call site.
///
/// `session` is the id to pin or resume, and `resume` says which. Both name
/// the same id, which is what makes a chat's whole life one conversation.
///
/// `--verbose` is not optional here: without it `-p --output-format
/// stream-json` refuses to run. The prompt goes on stdin for the same reason
/// as Codex's — a prompt beginning with a dash is text, not a flag.
pub struct TurnShape<'a> {
    /// The id to pin (first turn) or resume (every turn after).
    pub session: &'a str,
    pub resume: bool,
    pub permission: PermissionMode,
    pub places: &'a [String],
    pub model: Option<&'a str>,
    pub effort: Option<&'a str>,
    pub system_prompt: Option<&'a str>,
    /// Whether Vibyra is reachable to answer permission questions.
    pub bridged: bool,
}

pub fn turn_args(shape: TurnShape<'_>) -> Vec<String> {
    let mut args = vec![
        "-p".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--permission-mode".into(),
        permission_mode(shape.permission, shape.bridged).into(),
    ];
    if shape.resume {
        args.extend(["--resume".into(), shape.session.into()]);
    } else {
        args.extend(["--session-id".into(), shape.session.into()]);
    }
    for place in shape.places {
        args.extend(["--add-dir".into(), place.clone()]);
    }
    if let Some(model) = shape.model {
        args.extend(["--model".into(), model.into()]);
    }
    if let Some(effort) = shape.effort {
        args.extend(["--effort".into(), effort.into()]);
    }
    if let Some(prompt) = shape.system_prompt {
        args.extend(["--append-system-prompt".into(), prompt.into()]);
    }
    args
}

/// The flags that route permission prompts through Vibyra.
///
/// `--mcp-config` takes the server definition inline, verified against
/// claude 2.1.258 (`--help` lists "JSON files or strings"). The bridge's
/// coordinates travel in the server's own `env`, so nothing about the running
/// app has to be written to disk for the provider to find it.
pub fn bridge_args(bridge: &PermissionBridge) -> Vec<String> {
    let config = serde_json::json!({
        "mcpServers": {
            "vibyra": {
                "command": bridge.exe.to_string_lossy(),
                "args": ["--permission-bridge"],
                "env": {
                    "VIBYRA_BRIDGE_PORT": bridge.port.to_string(),
                    "VIBYRA_BRIDGE_TOKEN": bridge.token,
                    "VIBYRA_BRIDGE_CHAT": bridge.chat_id,
                    "VIBYRA_BRIDGE_TURN": bridge.turn_id,
                }
            }
        }
    });
    vec![
        "--permission-prompt-tool".into(),
        PROMPT_TOOL.into(),
        "--mcp-config".into(),
        config.to_string(),
    ]
}
