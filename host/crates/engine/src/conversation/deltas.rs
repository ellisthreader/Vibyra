use super::model::{bounded, Conversation};
use serde_json::{json, Value};

pub(crate) fn apply(c: &Conversation, method: &str, params: &Value) -> Option<Value> {
    let id = params["itemId"].as_str()?;
    let command = method == "item/commandExecution/outputDelta";
    let existing = c.items.iter().find(|i| i["id"] == id);
    let mut item = if command {
        // Output can only extend an observed running command, never invent its purpose.
        existing
            .filter(|i| {
                i["category"] == "commandExecution"
                    && i["status"] == "running"
                    && i["turnId"] == params["turnId"]
            })?
            .clone()
    } else {
        if existing.is_some_and(|i| i["status"] != "running" || i["turnId"] != params["turnId"]) {
            return None;
        }
        existing.cloned().unwrap_or_else(|| {
            json!({"id":id,"turnId":params["turnId"],
            "kind":"message","role":"assistant","text":"","status":"running"})
        })
    };
    let field = if command { "detail" } else { "text" };
    let content = format!(
        "{}{}",
        item[field].as_str().unwrap_or(""),
        params["delta"].as_str().unwrap_or("")
    );
    let truncated = item["truncated"] == true || content.len() > 8192;
    item[field] = json!(bounded(&content, 8192));
    item["truncated"] = json!(truncated);
    Some(item)
}
