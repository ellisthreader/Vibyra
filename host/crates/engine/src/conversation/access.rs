use super::{authorize, publish};
use crate::{identifier, text, Engine};
use serde_json::{json, Value};

/// How much a conversation may do without asking: `ask` before edits and
/// commands, `auto` for edits inside the project, `full` for anything.
const LEVELS: [&str; 3] = ["ask", "auto", "full"];

/// The chat's access level. Chats saved before levels existed keep what
/// they launched with: full access, Codex's sandboxed default, or asking.
pub(crate) fn access_level(settings: &Value) -> &str {
    match settings["access"].as_str() {
        Some(level) if LEVELS.contains(&level) => level,
        _ if settings["approvalPolicy"] == "never" => "full",
        _ if settings["provider"] == "codex" || settings["provider"].is_null() => "auto",
        _ => "ask",
    }
}

/// Adds the access level to a `turn/start`. Codex takes its own approval and
/// sandbox overrides; the Claude and Gemini bridges read `access` and answer
/// their tool prompts themselves. Codex chats nobody changed keep the exact
/// sandbox they launched with.
pub(super) fn apply_to_turn(settings: &Value, params: &mut Value) {
    let level = access_level(settings);
    if settings["provider"] != "codex" && !settings["provider"].is_null() {
        params["access"] = json!(level);
        return;
    }
    if settings["accessSet"] != true {
        return;
    }
    let workspace = if settings["sandbox"]["type"] == "workspaceWrite" {
        settings["sandbox"].clone()
    } else {
        json!({"type":"workspaceWrite"})
    };
    let (approval, sandbox) = match level {
        "full" => ("never", json!({"type":"dangerFullAccess"})),
        "ask" => ("untrusted", workspace),
        _ => ("on-request", workspace),
    };
    params["approvalPolicy"] = json!(approval);
    params["sandboxPolicy"] = sandbox;
}

impl Engine {
    /// Changes what the chat may do from its next message on. Only the Mac
    /// itself may call this: a paired phone can never raise a chat's access.
    pub(crate) fn conversation_access(
        &self,
        device: &str,
        params: &Value,
    ) -> Result<Value, String> {
        if device != "desktop" {
            return Err("Change what this chat may do on the Mac".into());
        }
        let id = text(params, "sessionId")?;
        let request = text(params, "requestId")?;
        identifier(request)?;
        let level = text(params, "access")?;
        if !LEVELS.contains(&level) {
            return Err("Unknown access level".into());
        }
        let mut state = self.shared.lock();
        authorize(state.session(id)?, device, params)?;
        let c = state
            .conversations
            .get_mut(id)
            .ok_or("Conversation not found")?;
        let intent = json!({"access":level,"revision":params["revision"]});
        if let Some(receipt) = c.receipts.get(request) {
            if receipt["device"] != device || receipt["accessRequest"] != intent {
                return Err("Settings receipt belongs to a different action".into());
            }
            return Ok(receipt["settings"].clone());
        }
        let revision = c.settings["revision"].as_u64().unwrap_or(0);
        if revision
            != params["revision"]
                .as_u64()
                .ok_or("Missing settings revision")?
        {
            return Err("Settings changed on another device; refresh before choosing".into());
        }
        if c.receipts.len() >= 4096 {
            return Err("Conversation receipt limit reached".into());
        }
        c.settings["access"] = json!(level);
        c.settings["accessSet"] = json!(true);
        c.settings["revision"] = json!(revision + 1);
        c.settings["appliesTo"] = json!("nextTurn");
        let result = c.settings.clone();
        c.receipts.insert(
            request.into(),
            json!({"device":device,"accessRequest":intent,"settings":result,"status":"accepted"}),
        );
        publish(&mut state, id, None)?;
        Ok(result)
    }
}
