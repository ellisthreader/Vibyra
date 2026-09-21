use super::{authorize, publish};
use crate::{identifier, text, Engine};
use serde_json::{json, Value};
impl Engine {
    pub(crate) fn conversation_settings(
        &self,
        device: &str,
        params: &Value,
    ) -> Result<Value, String> {
        let id = text(params, "sessionId")?;
        let request = text(params, "requestId")?;
        identifier(request)?;
        // Validate authority before making even a read against this account's provider.
        {
            let state = self.shared.lock();
            authorize(state.session(id)?, device, params)?;
        }
        let intent = json!({"model":params["model"],"effort":params["effort"],"revision":params["revision"]});
        let catalogue = self.conversation_command("conversation.models", params)?;
        let mut state = self.shared.lock();
        authorize(state.session(id)?, device, params)?;
        let c = state
            .conversations
            .get_mut(id)
            .ok_or("Conversation not found")?;
        if let Some(receipt) = c.receipts.get(request) {
            if receipt["device"] != device || receipt["settingsRequest"] != intent {
                return Err("Settings receipt belongs to a different action".into());
            }
            return Ok(receipt["settings"].clone());
        }
        if c.settings["revision"].as_u64().unwrap_or(0)
            != params["revision"]
                .as_u64()
                .ok_or("Missing settings revision")?
        {
            return Err("Settings changed on another device; refresh before choosing".into());
        }
        let model = text(params, "model")?;
        let selected = catalogue["models"]
            .as_array()
            .and_then(|models| models.iter().find(|m| m["model"] == model))
            .ok_or("This model is not available for the selected account")?;
        let effort = text(params, "effort")?;
        if !selected["supportedReasoningEfforts"]
            .as_array()
            .is_some_and(|levels| levels.iter().any(|l| l["reasoningEffort"] == effort))
        {
            return Err("This effort is not supported by the selected model".into());
        }
        if c.receipts.len() >= 4096 {
            return Err("Conversation receipt limit reached".into());
        }
        c.settings["model"] = json!(model);
        c.settings["effort"] = json!(effort);
        c.settings["revision"] = json!(params["revision"].as_u64().unwrap() + 1);
        c.settings["appliesTo"] = json!("nextTurn");
        let result = c.settings.clone();
        c.receipts.insert(
            request.into(),
            json!({"device":device,"settingsRequest":intent,"settings":result,"status":"accepted"}),
        );
        publish(&mut state, id, None)?;
        Ok(result)
    }
}
