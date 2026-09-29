//! A provider request the phone cannot answer, while the Mac's own CLI can.
//! The phone still sees it, so a waiting turn never looks frozen.
use super::model::Conversation;
use serde_json::{json, Value};

fn key(rpc: &Value) -> String {
    format!("mac-request:{rpc}")
}

/// The visible card for a request the attached Mac CLI will present.
pub(crate) fn delegated(method: &str, rpc: &Value, p: &Value) -> Value {
    let (title, fallback) = match method {
        "mcpServer/elicitation/request" => (
            "A connected tool needs your input",
            format!(
                "{} is asking for input.",
                p["serverName"].as_str().unwrap_or("A tool")
            ),
        ),
        "item/fileChange/requestApproval" | "applyPatchApproval" => (
            "Allow these file changes?",
            "The agent wants to change files outside its usual scope.".into(),
        ),
        "item/permissions/requestApproval" => (
            "Allow additional access?",
            "The agent is asking for more access than this chat has.".into(),
        ),
        m if m.contains("command") || m == "execCommandApproval" => (
            "Allow this command?",
            "The agent wants to run a command.".into(),
        ),
        _ => ("The agent needs your answer", "The agent is waiting for a decision.".into()),
    };
    let command = match &p["command"] {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => Some(
            parts
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(" "),
        ),
        _ => None,
    };
    json!({"id":key(rpc),"turnId":p["turnId"],"kind":"permission","status":"elsewhere",
        "title":title,"text":p["reason"].as_str().or(p["message"].as_str()).map(str::to_owned).unwrap_or(fallback),
        "detail":command,"scope":p["cwd"]})
}

/// The Mac answered it; the provider does not say which way.
pub(crate) fn answered(c: &Conversation, rpc: &Value) -> Option<Value> {
    let mut item = c
        .items
        .iter()
        .find(|i| i["id"] == key(rpc) && i["status"] == "elsewhere")?
        .clone();
    item["status"] = json!("answered");
    Some(item)
}

/// A turn ended with the request still open on the Mac.
pub(crate) fn expire(c: &mut Conversation) {
    for item in &mut c.items {
        if item["status"] == "elsewhere" {
            item["status"] = json!("expired");
        }
    }
}
