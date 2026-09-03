//! The one event vocabulary the rest of Vibyra is allowed to know about.
//!
//! Claude Code and Codex both emit JSONL, and they agree on almost nothing:
//! Claude sends whole assistant messages carrying a `content` array, Codex
//! sends `item.completed` envelopes around typed items. Their session ids
//! arrive under different names at different moments. Every difference between
//! them is absorbed by the adapters and stops here, so the transcript reducer,
//! the approval broker and the routine runner are written once.
//!
//! Two rules keep the log from becoming the problem it is meant to solve:
//!
//! * **Not everything is persisted.** `assistant.delta` exists to make typing
//!   feel live and is worthless a second later — the completed message says
//!   the same thing in one row. `persisted()` is what decides, and the reducer
//!   on the other side folds deltas into the same message the completion
//!   replaces, so a reload looks identical to what was on screen.
//! * **Everything is bounded.** A tool that prints a megabyte is a real thing
//!   that happens, and it must cost one truncated row, not a database.

use serde::{Deserialize, Serialize};

/// Why a turn is happening, when nobody typed it.
///
/// The transcript needs this to say "Scheduled run · Morning digest" above a
/// prompt no person wrote. `Occasion` in `agent_context` shapes what the
/// *agent* is told; this is what the *reader* is told, and they are separate
/// types on purpose — one is prompt text, the other is a stored fact.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TurnOccasion {
    Routine { name: String },
    Handoff { from: String },
}

/// Beyond this, a single text payload is truncated with a marker. Generous
/// enough for a normal file or command output, small enough that a runaway
/// process cannot fill the disk one row at a time.
pub const MAX_TEXT: usize = 60_000;

/// One thing that happened in a chat, provider-independent.
///
/// Field names cross to the frontend as camelCase and are stored that way
/// from now on; the snake_case aliases read every row written before this,
/// because a transcript is append-only and old rows are never rewritten.
/// The outer `ChatEventRow` flattens this enum, and its own `rename_all`
/// does not reach flattened fields — which is how `call_id` and `cost_usd`
/// reached a frontend reading `callId` and `costUsd`, gave every tool block
/// the key `tool-undefined`, and crashed the turn footer on `undefined.toFixed`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind")]
pub enum AgentEvent {
    #[serde(rename = "turn.started")]
    TurnStarted {
        prompt: String,
        /// Why this turn happened, when nobody typed it. Optional and
        /// defaulted so every turn stored before this field existed still
        /// deserialises — a transcript is an append-only log, and old rows
        /// are never rewritten.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        occasion: Option<TurnOccasion>,
    },
    /// Streaming text. Never persisted; see the module note.
    #[serde(rename = "assistant.delta")]
    AssistantDelta { text: String },
    #[serde(rename = "assistant.completed")]
    AssistantCompleted { text: String },
    #[serde(rename = "reasoning.summary")]
    ReasoningSummary { text: String },
    #[serde(rename = "tool.requested")]
    ToolRequested {
        #[serde(rename = "callId", alias = "call_id")]
        call_id: String,
        tool: String,
        summary: String,
    },
    #[serde(rename = "tool.output")]
    ToolOutput {
        #[serde(rename = "callId", alias = "call_id")]
        call_id: String,
        tool: String,
        output: String,
        #[serde(rename = "exitCode", alias = "exit_code")]
        exit_code: Option<i64>,
        failed: bool,
    },
    #[serde(rename = "file.changed")]
    FileChanged { path: String, change: String },
    /// A skill whose trigger matched this prompt, named at the version that
    /// ran. Emitted once per match, before the turn starts.
    #[serde(rename = "skill.applied")]
    SkillApplied {
        #[serde(rename = "skillId", alias = "skill_id")]
        skill_id: String,
        name: String,
        version: i64,
    },
    #[serde(rename = "approval.requested")]
    ApprovalRequested {
        #[serde(rename = "approvalId", alias = "approval_id")]
        approval_id: String,
        action: String,
    },
    #[serde(rename = "approval.resolved")]
    ApprovalResolved {
        #[serde(rename = "approvalId", alias = "approval_id")]
        approval_id: String,
        approved: bool,
    },
    #[serde(rename = "usage.updated")]
    UsageUpdated {
        #[serde(rename = "inputTokens", alias = "input_tokens")]
        input_tokens: i64,
        #[serde(rename = "outputTokens", alias = "output_tokens")]
        output_tokens: i64,
        #[serde(rename = "costUsd", alias = "cost_usd")]
        cost_usd: Option<f64>,
    },
    /// The provider has told us which conversation this is. Until this
    /// arrives a chat cannot be resumed, which is why it is persisted even
    /// though it renders as nothing.
    #[serde(rename = "session.identified")]
    SessionIdentified {
        #[serde(rename = "sessionId", alias = "session_id")]
        session_id: String,
    },
    #[serde(rename = "turn.completed")]
    TurnCompleted { result: String },
    #[serde(rename = "turn.failed")]
    TurnFailed { message: String },
}

impl AgentEvent {
    /// The string stored in `chat_events.kind` and matched on by the frontend
    /// reducer. Kept as an explicit method rather than derived from the enum
    /// name so renaming a variant cannot silently rewrite stored history.
    pub fn kind(&self) -> &'static str {
        match self {
            AgentEvent::TurnStarted { .. } => "turn.started",
            AgentEvent::AssistantDelta { .. } => "assistant.delta",
            AgentEvent::AssistantCompleted { .. } => "assistant.completed",
            AgentEvent::ReasoningSummary { .. } => "reasoning.summary",
            AgentEvent::ToolRequested { .. } => "tool.requested",
            AgentEvent::ToolOutput { .. } => "tool.output",
            AgentEvent::FileChanged { .. } => "file.changed",
            AgentEvent::SkillApplied { .. } => "skill.applied",
            AgentEvent::ApprovalRequested { .. } => "approval.requested",
            AgentEvent::ApprovalResolved { .. } => "approval.resolved",
            AgentEvent::UsageUpdated { .. } => "usage.updated",
            AgentEvent::SessionIdentified { .. } => "session.identified",
            AgentEvent::TurnCompleted { .. } => "turn.completed",
            AgentEvent::TurnFailed { .. } => "turn.failed",
        }
    }

    /// Whether this event belongs in the durable transcript.
    ///
    /// Only deltas are dropped, and only because the completion that follows
    /// carries the same text in one row. Everything else — including the
    /// events that render as nothing — is history someone may need to explain
    /// what an agent did.
    pub fn persisted(&self) -> bool {
        !matches!(self, AgentEvent::AssistantDelta { .. })
    }

    /// The session id this event carries, if any. The runtime watches for it
    /// so the chat can be bound to its provider conversation the moment the
    /// provider names one.
    pub fn session_id(&self) -> Option<&str> {
        match self {
            AgentEvent::SessionIdentified { session_id } => Some(session_id),
            _ => None,
        }
    }
}
