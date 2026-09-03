//! Bounding an event's text on the way in, before it is queued or stored.
//!
//! Split from `events`, which keeps the wire shape, so the enum and its
//! serde annotations fit one screen.

use super::events::{AgentEvent, MAX_TEXT};

impl AgentEvent {
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
