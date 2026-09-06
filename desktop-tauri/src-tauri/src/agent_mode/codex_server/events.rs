use serde_json::Value;
use vibyra_core::agent_runtime::AgentEvent;

pub fn text(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or("").into()
}
pub fn normalize(method: &str, params: &Value) -> Vec<AgentEvent> {
    let mut events = Vec::new();
    if method == "item/agentMessage/delta" {
        events.push(AgentEvent::AssistantDelta {
            text: text(params, "delta"),
        });
    }
    let item = &params["item"];
    let kind = text(item, "type");
    if method == "item/started" && kind == "commandExecution" {
        events.push(AgentEvent::ToolRequested {
            call_id: text(item, "id"),
            tool: "Bash".into(),
            summary: text(item, "command"),
        });
    }
    if method == "item/started" && kind == "fileChange" {
        events.push(AgentEvent::ToolRequested {
            call_id: text(item, "id"),
            tool: "Edit".into(),
            summary: item["changes"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|c| text(c, "path"))
                .collect::<Vec<_>>()
                .join(", "),
        });
    }
    if method != "item/completed" {
        return events;
    }
    match kind.as_str() {
        "agentMessage" => events.push(AgentEvent::AssistantCompleted {
            text: text(item, "text"),
        }),
        "reasoning" => {
            if let Some(summary) = item.get("summary").and_then(Value::as_array) {
                let text = summary
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join("\n");
                if !text.is_empty() {
                    events.push(AgentEvent::ReasoningSummary { text });
                }
            }
        }
        "commandExecution" => events.push(AgentEvent::ToolOutput {
            call_id: text(item, "id"),
            tool: "Bash".into(),
            output: text(item, "aggregatedOutput"),
            exit_code: item.get("exitCode").and_then(Value::as_i64),
            failed: text(item, "status") != "completed",
        }),
        "fileChange" => {
            let completed = text(item, "status") == "completed";
            events.push(AgentEvent::ToolOutput {
                call_id: text(item, "id"),
                tool: "Edit".into(),
                output: format!("File edit {}", text(item, "status")),
                exit_code: None,
                failed: !completed,
            });
            if let Some(changes) = item
                .get("changes")
                .and_then(Value::as_array)
                .filter(|_| completed)
            {
                for change in changes {
                    events.push(AgentEvent::FileChanged {
                        path: text(change, "path"),
                        change: text(&change["kind"], "type"),
                    });
                }
            }
        }
        _ => {}
    }
    events
}
