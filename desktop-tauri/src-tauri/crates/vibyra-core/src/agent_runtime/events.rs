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

/// Beyond this, a single text payload is truncated with a marker. Generous
/// enough for a normal file or command output, small enough that a runaway
/// process cannot fill the disk one row at a time.
pub const MAX_TEXT: usize = 60_000;

/// One thing that happened in a chat, provider-independent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind")]
pub enum AgentEvent {
    #[serde(rename = "turn.started")]
    TurnStarted { prompt: String },
    /// Streaming text. Never persisted; see the module note.
    #[serde(rename = "assistant.delta")]
    AssistantDelta { text: String },
    #[serde(rename = "assistant.completed")]
    AssistantCompleted { text: String },
    #[serde(rename = "reasoning.summary")]
    ReasoningSummary { text: String },
    #[serde(rename = "tool.requested")]
    ToolRequested {
        call_id: String,
        tool: String,
        summary: String,
    },
    #[serde(rename = "tool.output")]
    ToolOutput {
        call_id: String,
        tool: String,
        output: String,
        exit_code: Option<i64>,
        failed: bool,
    },
    #[serde(rename = "file.changed")]
    FileChanged { path: String, change: String },
    #[serde(rename = "approval.requested")]
    ApprovalRequested { approval_id: String, action: String },
    #[serde(rename = "approval.resolved")]
    ApprovalResolved { approval_id: String, approved: bool },
    #[serde(rename = "usage.updated")]
    UsageUpdated {
        input_tokens: i64,
        output_tokens: i64,
        cost_usd: Option<f64>,
    },
    /// The provider has told us which conversation this is. Until this
    /// arrives a chat cannot be resumed, which is why it is persisted even
    /// though it renders as nothing.
    #[serde(rename = "session.identified")]
    SessionIdentified { session_id: String },
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

    /// Clamps every text payload to `MAX_TEXT`, marking what was cut.
    ///
    /// Applied on the way *in*, before the event is queued or stored, so a
    /// provider that streams a runaway file cannot reach either the database
    /// or the webview with it.
    pub fn bounded(self) -> Self {
        match self {
            AgentEvent::AssistantDelta { text } => AgentEvent::AssistantDelta { text: clamp(text) },
            AgentEvent::AssistantCompleted { text } => {
                AgentEvent::AssistantCompleted { text: clamp(text) }
            }
            AgentEvent::ReasoningSummary { text } => {
                AgentEvent::ReasoningSummary { text: clamp(text) }
            }
            AgentEvent::ToolOutput {
                call_id,
                tool,
                output,
                exit_code,
                failed,
            } => AgentEvent::ToolOutput {
                call_id,
                tool,
                output: clamp(output),
                exit_code,
                failed,
            },
            AgentEvent::TurnCompleted { result } => AgentEvent::TurnCompleted {
                result: clamp(result),
            },
            AgentEvent::TurnFailed { message } => AgentEvent::TurnFailed {
                message: clamp(message),
            },
            other => other,
        }
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

/// Truncates on a character boundary, never mid-UTF-8, and says so in the text
/// rather than leaving the reader to wonder why output stops.
fn clamp(text: String) -> String {
    if text.len() <= MAX_TEXT {
        return text;
    }
    let cut = (0..=MAX_TEXT)
        .rev()
        .find(|index| text.is_char_boundary(*index))
        .unwrap_or(0);
    let dropped = text.len() - cut;
    format!("{}\n… {dropped} more bytes not shown", &text[..cut])
}
