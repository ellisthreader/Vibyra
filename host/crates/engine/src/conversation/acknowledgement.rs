use super::model::Conversation;
use serde_json::{json, Value};

pub(crate) fn resolved(c: &mut Conversation, key: &Value, dynamic: bool) -> Option<Value> {
    if key.is_null() {
        return None;
    }
    let mut item = c
        .items
        .iter()
        .find(|i| {
            if dynamic {
                i["method"] == "item/tool/call" && i["action"]["callId"] == *key
            } else {
                i["rpcId"] == *key
            }
        })?
        .clone();
    if matches!(item["status"].as_str(), Some("responding" | "unknown"))
        && item["decisionId"].is_string()
    {
        item["status"] = json!(if item["decision"] == "decline" {
            "declined"
        } else {
            "accepted"
        });
    } else if item["status"] == "pending" {
        item["status"] = json!("expired");
    }
    if let Some(receipt) = item["decisionId"]
        .as_str()
        .and_then(|id| c.receipts.get_mut(id))
    {
        receipt["status"] = item["status"].clone();
    }
    if matches!(c.turn_state.as_str(), "running" | "waiting") {
        c.turn_state = if c.items.iter().any(|i| {
            i["id"] != item["id"] && matches!(i["status"].as_str(), Some("pending" | "responding"))
        }) {
            "waiting"
        } else {
            "running"
        }
        .into();
    }
    Some(item)
}
