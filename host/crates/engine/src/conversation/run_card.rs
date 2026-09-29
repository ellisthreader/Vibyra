//! The Run card: what the owner sees before an agent's app runs outside the
//! sandbox, and its place in the conversation.

use super::publish;
use super::run_tool::NAME;
use crate::state::Shared;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub(super) fn card(
    value: &Value,
    token: &str,
    name: &str,
    command: &str,
    cwd: &str,
    body: Option<&str>,
) -> Value {
    let p = &value["params"];
    let request = uuid::Uuid::new_v4().to_string();
    let version = format!(
        "{:x}",
        Sha256::digest(format!("{NAME}:{}:{p}:{token}", value["id"]))
    );
    let mut action = p.clone();
    // Private: `action` never reaches a client.
    action["vibyraRunToken"] = json!(token);
    let detail = match body {
        Some(body) => format!("{command}\n\n{body}"),
        None => command.to_owned(),
    };
    json!({"id":request,"requestId":request,"turnId":p["turnId"],"kind":"permission",
        "title":"Run this app on your computer?","text":format!("{name} runs outside the agent sandbox so its window opens on your phone, where you can tap and type in it."),
        "detail":detail,"scope":cwd,"status":"pending","actionVersion":version,"allowLabel":"Run",
        "choices":["decline","accept"],"persistentAvailable":false,
        "runApp":{"name":name,"command":command,"cwd":cwd,"body":body},
        "rpcId":value["id"],"method":"item/tool/call","action":action})
}

pub(super) fn show(shared: &Shared, id: &str, generation: &str, card: Value) -> Result<(), String> {
    let mut state = shared.lock();
    let c = state
        .conversations
        .get_mut(id)
        .ok_or("The conversation closed")?;
    if c.generation != generation {
        return Err("The conversation restarted".into());
    }
    let waiting = c
        .items
        .iter()
        .filter(|i| matches!(i["status"].as_str(), Some("pending" | "responding")))
        .count();
    if waiting >= 2 {
        return Err(
            "Another request is waiting for the user; ask again after it is answered.".into(),
        );
    }
    c.turn_state = "waiting".into();
    publish(&mut state, id, Some(card))
}
