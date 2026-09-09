use super::model::bounded;
use serde_json::{json, Value};

pub(crate) fn item(raw: &Value, turn: &Value, completed: bool) -> Option<Value> {
    let id = raw["id"].as_str()?;
    let kind = raw["type"].as_str()?;
    // User messages are inserted durably using client submission identity before dispatch.
    if matches!(kind, "userMessage" | "reasoning") {
        return None;
    }
    if kind == "agentMessage" {
        return Some(
            json!({"id":id,"turnId":turn,"kind":"message","role":"assistant",
            "text":bounded(raw["text"].as_str().unwrap_or(""),8192),
            "truncated":raw["text"].as_str().is_some_and(|s|s.len()>8192),
            "status":if completed {"completed"} else {"running"}}),
        );
    }
    let title = match kind {
        "commandExecution" => command_title(raw),
        "fileChange" => "Updating files",
        "webSearch" => "Searching the web",
        "mcpToolCall" | "dynamicToolCall" => "Using a tool",
        "imageView" => "Viewing an image",
        "plan" => "Planning",
        "contextCompaction" => "Organizing context",
        _ => "Working",
    };
    let status = match raw["status"].as_str() {
        Some("failed" | "declined") => "failed",
        _ if completed => "completed",
        _ => "running",
    };
    let detail = if kind == "commandExecution" {
        format!(
            "{}\n{}",
            raw["command"].as_str().unwrap_or(""),
            raw["aggregatedOutput"].as_str().unwrap_or("")
        )
    } else if kind == "fileChange" {
        serde_json::to_string(&raw["changes"]).unwrap_or_default()
    } else {
        String::new()
    };
    Some(
        json!({"id":id,"turnId":turn,"kind":"activity","title":title,
        "detail":bounded(&detail,8192),"status":status,"exitCode":raw["exitCode"],"category":kind,
        "truncated":detail.len()>8192}),
    )
}

fn command_title(raw: &Value) -> &str {
    let Some(actions) = raw["commandActions"].as_array().filter(|a| !a.is_empty()) else {
        return "Running command";
    };
    if actions.iter().all(|a| a["type"] == "read") {
        "Reading files"
    } else if actions.iter().all(|a| a["type"] == "search") {
        "Searching files"
    } else if actions.iter().all(|a| a["type"] == "listFiles") {
        "Exploring files"
    } else {
        "Running command"
    }
}
