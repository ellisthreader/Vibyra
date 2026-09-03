//! One shape for "run a turn", whichever engine is behind it.
//!
//! The asymmetry the two adapters hide is worth stating once, because it is
//! the reason this type carries a session id *in and out*:
//!
//! | | who chooses the conversation id | when Vibyra learns it |
//! |---|---|---|
//! | Claude | Vibyra, via `--session-id` | before the process starts |
//! | Codex  | Codex, via `thread.started` | after the first turn begins |
//!
//! So a Claude chat is addressable from the moment it is created, and a Codex
//! chat is not addressable until its first turn has said hello. Everything
//! above this file is written against the second, harder case: a chat may have
//! no session id yet, and the runtime binds one when `session.identified`
//! arrives. The alternative — Codex's `--last` — is not a conversation, it is
//! a guess about which conversation the user meant.

use crate::agent_model::{Engine, PermissionMode};
use crate::agent_runtime::events::AgentEvent;
use crate::agent_runtime::process::TurnCommand;
use crate::agentdb::ids::new_session_id;

/// Everything needed to run one turn, assembled by the caller from the chat,
/// its agent, and the grants in force right now.
pub struct TurnPlan {
    pub engine: Engine,
    /// The conversation to continue, or `None` for a chat that has never run.
    pub session: Option<String>,
    pub permission: PermissionMode,
    /// Where the process runs. Always a granted place — usually the agent's
    /// own home, never silently the project the user happens to have open.
    pub cwd: String,
    /// Granted folders, offered to the provider as additional roots.
    pub places: Vec<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    /// Attachment paths, already copied into the chat's own folder.
    pub images: Vec<String>,
    pub prompt: String,
    /// Brief, memory, skills and grants, assembled by `agent_context`.
    pub system_prompt: Option<String>,
    /// The account's credential directory variable, and every provider
    /// variable to strip. Supplied by the shell crate, which owns accounts.
    pub env: Vec<(String, String)>,
    pub env_remove: Vec<String>,
    /// Where Claude's permission prompts go. `None` runs the provider with its
    /// own non-interactive behaviour, which denies anything it cannot allow.
    pub bridge: Option<super::claude::PermissionBridge>,
}

/// A built turn: the process to run, and the session id it will belong to.
pub struct PlannedTurn {
    pub command: TurnCommand,
    /// Known up front for Claude, `None` for a first Codex turn. When it is
    /// `Some`, the caller may bind the chat to it immediately; when it is
    /// `None`, the caller waits for `session.identified`.
    pub session: Option<String>,
}

impl TurnPlan {
    /// Builds the command for this turn.
    ///
    /// The system prompt reaches Claude through `--append-system-prompt`,
    /// which is a channel the provider understands. Codex has no equivalent
    /// on `exec`, so its context is prepended to the prompt behind a clearly
    /// delimited header — the fallback the plan calls for, never a file
    /// written into the user's repository.
    pub fn build(self) -> PlannedTurn {
        match self.engine {
            Engine::Claude => self.build_claude(),
            Engine::Codex => self.build_codex(),
        }
    }

    fn build_claude(self) -> PlannedTurn {
        let resume = self.session.is_some();
        let session = self.session.clone().unwrap_or_else(new_session_id);
        let mut args = super::claude::turn_args(super::claude::TurnShape {
            session: &session,
            resume,
            permission: self.permission,
            places: &self.places,
            model: self.model.as_deref(),
            effort: self.effort.as_deref(),
            system_prompt: self.system_prompt.as_deref(),
            bridged: self.bridge.is_some(),
        });
        if let Some(bridge) = self.bridge.as_ref() {
            args.extend(super::claude::bridge_args(bridge));
        }
        PlannedTurn {
            command: TurnCommand {
                program: "claude".into(),
                args,
                cwd: self.cwd,
                env: self.env,
                env_remove: self.env_remove,
                prompt: self.prompt,
            },
            session: Some(session),
        }
    }

    fn build_codex(self) -> PlannedTurn {
        let args = match self.session.as_deref() {
            Some(thread) => super::codex::resume_args(
                thread,
                self.permission,
                self.model.as_deref(),
                self.effort.as_deref(),
                &self.images,
            ),
            None => super::codex::start_args(
                &self.cwd,
                self.permission,
                &self.places,
                self.model.as_deref(),
                self.effort.as_deref(),
                &self.images,
            ),
        };
        PlannedTurn {
            command: TurnCommand {
                program: "codex".into(),
                args,
                cwd: self.cwd,
                env: self.env,
                env_remove: self.env_remove,
                prompt: with_preamble(self.system_prompt.as_deref(), &self.prompt),
            },
            session: self.session,
        }
    }
}

/// Codex's context channel: a delimited block ahead of the user's words.
///
/// Delimited rather than merged so the model can tell Vibyra's framing from
/// the person's request, and so a transcript reader can too.
fn with_preamble(system_prompt: Option<&str>, prompt: &str) -> String {
    match system_prompt.map(str::trim).filter(|text| !text.is_empty()) {
        Some(context) => {
            format!("<vibyra-context>\n{context}\n</vibyra-context>\n\n{prompt}")
        }
        None => prompt.to_string(),
    }
}

/// Parses one line of provider output into normalized events, bounded.
///
/// Bounding happens here rather than at the call sites so there is no path
/// from a provider's stdout to the database or the webview that skips it.
pub fn normalize(engine: Engine, line: &str) -> Vec<AgentEvent> {
    let events = match engine {
        Engine::Claude => super::claude_events::normalize(line),
        Engine::Codex => super::codex_events::normalize(line),
    };
    events.into_iter().map(AgentEvent::bounded).collect()
}
