//! Reading Claude Code's `stream-json` output.
//!
//! Split from `claude`, which is the command line, for the same reason the
//! Codex pair is split: the flags and the event shapes move independently.
//!
//! The shape that drives this file: one `assistant` message carries a
//! `content` array, and one array can hold thinking, text and several tool
//! calls at once. So a single provider line routinely becomes several
//! normalized events, in the order the model produced them.

use crate::agent_runtime::events::AgentEvent;

/// Turns one line of `stream-json` output into normalized events.
///
/// A `system`/`init` line names the session even when Vibyra already pinned
/// it; the event is emitted anyway, so a chat whose id somehow diverged is
/// corrected rather than left pointing at a conversation that is not there.
pub fn normalize(line: &str) -> Vec<AgentEvent> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return Vec::new();
    };
    match value.get("type").and_then(|v| v.as_str()).unwrap_or("") {
        "system" => text_at(&value, "session_id")
            .map(|session_id| vec![AgentEvent::SessionIdentified { session_id }])
            .unwrap_or_default(),
        "assistant" => content(&value),
        "user" => tool_results(&value),
        "result" => result(&value),
        _ => Vec::new(),
    }
}

/// An assistant message carries a `content` array of typed blocks, and one
/// message can hold several — text, a thinking block and two tool calls.
fn content(value: &serde_json::Value) -> Vec<AgentEvent> {
    blocks(value)
        .iter()
        .filter_map(
            |block| match block.get("type").and_then(|v| v.as_str()).unwrap_or("") {
                "text" => Some(AgentEvent::AssistantCompleted {
                    text: text_at(block, "text")?,
                }),
                "thinking" => Some(AgentEvent::ReasoningSummary {
                    text: text_at(block, "thinking")?,
                }),
                "tool_use" => Some(AgentEvent::ToolRequested {
                    call_id: text_at(block, "id").unwrap_or_default(),
                    tool: text_at(block, "name").unwrap_or_else(|| "tool".into()),
                    summary: summarize_input(block.get("input")),
                }),
                _ => None,
            },
        )
        .collect()
}

/// Tool results come back as a `user` message whose content holds
/// `tool_result` blocks addressed to the call they answer.
fn tool_results(value: &serde_json::Value) -> Vec<AgentEvent> {
    blocks(value)
        .iter()
        .filter(|block| block.get("type").and_then(|v| v.as_str()) == Some("tool_result"))
        .map(|block| AgentEvent::ToolOutput {
            call_id: text_at(block, "tool_use_id").unwrap_or_default(),
            tool: String::new(),
            output: summarize_input(block.get("content")),
            exit_code: None,
            failed: block
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        })
        .collect()
}

/// The final line: usage, cost, and whether the turn actually succeeded.
fn result(value: &serde_json::Value) -> Vec<AgentEvent> {
    let usage = value.get("usage");
    let field = |name: &str| {
        usage
            .and_then(|u| u.get(name))
            .and_then(|v| v.as_i64())
            .unwrap_or(0)
    };
    let mut events = vec![AgentEvent::UsageUpdated {
        input_tokens: field("input_tokens")
            + field("cache_read_input_tokens")
            + field("cache_creation_input_tokens"),
        output_tokens: field("output_tokens"),
        cost_usd: value.get("total_cost_usd").and_then(|v| v.as_f64()),
    }];
    let failed = value
        .get("is_error")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let text = text_at(value, "result").unwrap_or_default();
    events.push(if failed {
        AgentEvent::TurnFailed {
            message: if text.is_empty() {
                "the Claude turn failed".into()
            } else {
                text
            },
        }
    } else {
        AgentEvent::TurnCompleted { result: text }
    });
    events
}

fn blocks(value: &serde_json::Value) -> Vec<serde_json::Value> {
    value
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_array())
        .cloned()
        .unwrap_or_default()
}

/// Tool inputs are arbitrary JSON. The transcript wants one readable line, so
/// a bare string passes through and anything else is rendered compactly.
fn summarize_input(value: Option<&serde_json::Value>) -> String {
    match value {
        None | Some(serde_json::Value::Null) => String::new(),
        Some(serde_json::Value::String(text)) => text.clone(),
        Some(other) => other.to_string(),
    }
}

fn text_at(value: &serde_json::Value, key: &str) -> Option<String> {
    match value.get(key)? {
        serde_json::Value::Null => None,
        serde_json::Value::String(text) => Some(text.clone()),
        other => Some(other.to_string()),
    }
}
