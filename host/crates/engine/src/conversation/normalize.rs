use super::model::bounded;
use serde_json::{json, Value};

pub(crate) fn item(raw: &Value, turn: &Value, completed: bool) -> Option<Value> {
    let id = raw["id"].as_str()?;
    let kind = raw["type"].as_str()?;
    if kind == "userMessage" {
        let text = raw["content"]
            .as_array()?
            .iter()
            .filter_map(|part| part["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        return Some(json!({"id":id,"turnId":turn,"kind":"message","role":"user",
            "text":bounded(&text,262144),"status":"completed","provenance":"provider"}));
    }
    if kind == "agentMessage" {
        return Some(
            json!({"id":id,"turnId":turn,"kind":"message","role":"assistant",
            "text":bounded(raw["text"].as_str().unwrap_or(""),262144),
            "truncated":raw["text"].as_str().is_some_and(|s|s.len()>262144),
            "status":if completed {"completed"} else {"running"}}),
        );
    }
    let title = match kind {
        "commandExecution" => command_title(raw),
        "reasoning" => "Thinking",
        "fileChange" => "Updating files",
        "webSearch" => "Searching the web",
        "mcpToolCall" | "dynamicToolCall" => raw["tool"].as_str().unwrap_or("Using a tool"),
        "imageView" => "Viewing an image",
        "plan" => "Planning",
        "contextCompaction" => "Organizing context",
        _ => "Working",
    };
    let status = match raw["status"].as_str() {
        Some("failed") => "failed",
        Some("declined") => "declined",
        Some("interrupted") => "interrupted",
        _ if completed => "completed",
        _ => "running",
    };
    let detail = super::observed::detail(raw);
    Some(
        json!({"id":id,"turnId":turn,"kind":"activity","title":title,
        "detail":bounded(&detail,262144),"status":status,"exitCode":raw["exitCode"],"category":kind,
        "truncated":detail.len()>262144,"durationMs":raw["durationMs"],
        "command":raw["command"],"cwd":raw["cwd"],"actions":raw["commandActions"],
        "provenance":"provider","changes":if kind == "fileChange" {raw["changes"].clone()} else {Value::Null}}),
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
