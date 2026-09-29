use super::model::Conversation;
use serde_json::{json, Value};

pub(super) fn already_submitted(c: &Conversation, item: &Value) -> bool {
    // Match the provider's echoed client ID, not the active turn: a native
    // steering message can arrive while a phone-submitted turn is running.
    item["type"] == "userMessage"
        && item["clientId"]
            .as_str()
            .or_else(|| item["id"].as_str())
            .is_some_and(|id| c.receipts.contains_key(id))
}

pub(super) fn settings(c: &mut Conversation, actual: &Value) {
    for (from, to) in [
        ("model", "model"),
        ("effort", "effort"),
        ("approvalPolicy", "approvalPolicy"),
        ("sandboxPolicy", "sandbox"),
    ] {
        if let Some(value) = actual.get(from) {
            c.settings[to] = value.clone();
        }
    }
    c.settings["revision"] = json!(c.settings["revision"].as_u64().unwrap_or(0) + 1);
}
