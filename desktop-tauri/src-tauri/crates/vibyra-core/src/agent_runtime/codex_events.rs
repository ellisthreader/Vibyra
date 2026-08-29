//! Reading Codex's `--json` stream.
//!
//! Split from `codex`, which is the command line. The two are separate
//! contracts with the same CLI: a flag moving does not change how an
//! `item.completed` envelope is shaped, and a new item type does not change
//! how a turn is launched. Keeping them apart means a version bump touches one
//! file, not both.
//!
//! Fixtures for every shape below are in `tests.rs`, captured from codex-cli
//! 0.150.1 rather than paraphrased.

use crate::agent_runtime::events::AgentEvent;

/// Turns one line of `--json` output into normalized events.
///
/// Returns a list because one provider line can mean more than one thing: a
/// completed `file_change` item names every path it touched, and each is its
/// own `file.changed`. An unrecognised line returns nothing rather than an
/// error — a newer Codex adding an item type must not break a chat.
pub fn normalize(line: &str) -> Vec<AgentEvent> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return Vec::new();
    };
    match value.get("type").and_then(|v| v.as_str()).unwrap_or("") {
        "thread.started" => text_at(&value, "thread_id")
            .map(|session_id| vec![AgentEvent::SessionIdentified { session_id }])
            .unwrap_or_default(),
        "turn.completed" => vec![usage(&value)],
        "turn.failed" => vec![AgentEvent::TurnFailed {
            message: value
                .get("error")
                .and_then(describe_error)
                .unwrap_or_else(|| "the Codex turn failed".into()),
        }],
        "item.started" | "item.updated" | "item.completed" => value
            .get("item")
            .map(|item| self::item(item, value["type"] == "item.completed"))
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// One `item` envelope. `completed` separates a tool that has finished from
/// one that has only been announced, which is the difference between
/// `tool.output` and `tool.requested`.
fn item(item: &serde_json::Value, completed: bool) -> Vec<AgentEvent> {
    let kind = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let call_id = text_at(item, "id").unwrap_or_default();
    match (kind, completed) {
        ("agent_message", true) => vec![AgentEvent::AssistantCompleted {
            text: text_at(item, "text").unwrap_or_default(),
        }],
        ("reasoning", true) => vec![AgentEvent::ReasoningSummary {
            text: text_at(item, "text").unwrap_or_default(),
        }],
        ("command_execution", false) => vec![AgentEvent::ToolRequested {
            call_id,
            tool: "shell".into(),
            summary: text_at(item, "command").unwrap_or_default(),
        }],
        ("command_execution", true) => {
            let exit_code = item.get("exit_code").and_then(|v| v.as_i64());
            vec![AgentEvent::ToolOutput {
                call_id,
                tool: "shell".into(),
                output: text_at(item, "aggregated_output").unwrap_or_default(),
                exit_code,
                failed: exit_code.is_some_and(|code| code != 0)
                    || item.get("status").and_then(|v| v.as_str()) == Some("failed"),
            }]
        }
        ("file_change", true) => changes(item),
        ("mcp_tool_call", false) => vec![AgentEvent::ToolRequested {
            call_id,
            tool: mcp_name(item),
            summary: text_at(item, "arguments").unwrap_or_default(),
        }],
        ("mcp_tool_call", true) => vec![AgentEvent::ToolOutput {
            call_id,
            tool: mcp_name(item),
            output: text_at(item, "result").unwrap_or_default(),
            exit_code: None,
            failed: item.get("status").and_then(|v| v.as_str()) == Some("failed"),
        }],
        ("web_search", true) => vec![AgentEvent::ToolRequested {
            call_id,
            tool: "web_search".into(),
            summary: text_at(item, "query").unwrap_or_default(),
        }],
        _ => Vec::new(),
    }
}

/// A `file_change` item lists every path it touched under `changes`.
fn changes(item: &serde_json::Value) -> Vec<AgentEvent> {
    item.get("changes")
        .and_then(|v| v.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|change| {
                    Some(AgentEvent::FileChanged {
                        path: text_at(change, "path")?,
                        change: text_at(change, "kind")
                            .or_else(|| text_at(change, "type"))
                            .unwrap_or_else(|| "update".into()),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn mcp_name(item: &serde_json::Value) -> String {
    match (text_at(item, "server"), text_at(item, "tool")) {
        (Some(server), Some(tool)) => format!("{server}/{tool}"),
        (_, Some(tool)) => tool,
        _ => "mcp".into(),
    }
}

fn usage(value: &serde_json::Value) -> AgentEvent {
    let usage = value.get("usage");
    let field = |name: &str| {
        usage
            .and_then(|u| u.get(name))
            .and_then(|v| v.as_i64())
            .unwrap_or(0)
    };
    AgentEvent::UsageUpdated {
        input_tokens: field("input_tokens") + field("cached_input_tokens"),
        output_tokens: field("output_tokens"),
        cost_usd: None,
    }
}

/// An error can arrive as a string or as an object with a message.
fn describe_error(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| text_at(value, "message"))
}

/// A string field, or a compact rendering of a non-string one. Codex sends
/// `command` as a string and `arguments` as an object, and the transcript
/// wants readable text for both.
fn text_at(value: &serde_json::Value, key: &str) -> Option<String> {
    match value.get(key)? {
        serde_json::Value::Null => None,
        serde_json::Value::String(text) => Some(text.clone()),
        other => Some(other.to_string()),
    }
}
