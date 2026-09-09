use super::{authorize, publish};
use crate::{identifier, text, Engine};
use serde_json::{json, Value};

impl Engine {
    pub(crate) fn submit_turn(&self, device: &str, params: &Value) -> Result<Value, String> {
        let id = text(params, "sessionId")?;
        let submission = text(params, "submissionId")?;
        identifier(submission)?;
        let input = text(params, "text")?.trim();
        if input.is_empty() || input.len() > 8192 {
            return Err("Message must contain 1–8192 bytes".into());
        }
        let mut state = self.shared.lock();
        authorize(state.session(id)?, device, params)?;
        let c = state
            .conversations
            .get_mut(id)
            .ok_or("Conversation not found")?;
        if let Some(receipt) = c.receipts.get(submission) {
            if receipt["device"] != device || receipt["text"] != input {
                return Err("Submission ID was reused for a different message".into());
            }
            return Ok(
                json!({"submissionId":submission,"status":receipt["status"],"turnId":receipt["turnId"]}),
            );
        }
        if matches!(c.turn_state.as_str(), "running" | "waiting") {
            return Err("Wait for this turn or stop it before sending".into());
        }
        if c.receipts.len() >= 4096 {
            return Err("Conversation receipt limit reached; start a new chat".into());
        }
        let runtime = c
            .runtime
            .clone()
            .ok_or("Conversation process is unavailable")?;
        let thread = c.thread_id.clone();
        c.receipts.insert(
            submission.into(),
            json!({"device":device,"text":input,"status":"dispatching"}),
        );
        c.turn_state = "running".into();
        c.turn_id = None;
        c.active_submission = Some(submission.into());
        publish(
            &mut state,
            id,
            Some(json!({"id":submission,"turnId":null,"kind":"message",
            "role":"user","text":input,"status":"completed"})),
        )?;
        drop(state);
        let result = runtime.request(
            "turn/start",
            json!({"threadId":thread,
            "clientUserMessageId":submission,"input":[{"type":"text","text":input,"text_elements":[]}]}),
        );
        let mut state = self.shared.lock();
        let c = state
            .conversations
            .get_mut(id)
            .ok_or("Conversation not found")?;
        // A streamed turn/started event is authoritative even if the request reply was lost.
        let confirmed = c
            .receipts
            .get(submission)
            .filter(|r| r["status"] == "accepted");
        let (status, turn) = if let Some(receipt) = confirmed {
            ("accepted", receipt["turnId"].clone())
        } else {
            match &result {
                Ok(value) => ("accepted", value["turn"]["id"].clone()),
                Err(error) if !error.unknown => ("failed", Value::Null),
                Err(_) => ("unknown", Value::Null),
            }
        };
        if let Some(receipt) = c.receipts.get_mut(submission) {
            receipt["status"] = json!(status);
            receipt["turnId"] = turn.clone();
        }
        if c.turn_id.is_none() {
            c.turn_id = turn.as_str().map(str::to_owned);
        }
        if status == "failed" {
            c.turn_state = "failed".into();
        }
        let message = result.err().map(|error| error.message);
        let item = (status == "failed").then(|| json!({"id":format!("failed:{submission}"),
            "kind":"result","turnId":null,"status":"failed","title":"Couldn't start this turn","text":message}));
        publish(&mut state, id, item)?;
        Ok(json!({"submissionId":submission,"status":status,"turnId":turn,"message":message}))
    }
    pub(crate) fn interrupt_turn(&self, device: &str, params: &Value) -> Result<Value, String> {
        let state = self.shared.lock();
        let id = text(params, "sessionId")?;
        authorize(state.session(id)?, device, params)?;
        let c = state
            .conversations
            .get(id)
            .ok_or("Conversation not found")?;
        let turn = text(params, "turnId")?;
        if c.turn_id.as_deref() != Some(turn)
            || !matches!(c.turn_state.as_str(), "running" | "waiting")
        {
            return Err("This turn is no longer active".into());
        }
        let runtime = c
            .runtime
            .clone()
            .ok_or("Conversation process is unavailable")?;
        let thread = c.thread_id.clone();
        drop(state);
        runtime.request("turn/interrupt", json!({"threadId":thread,"turnId":turn}))?;
        Ok(json!({"accepted":true}))
    }
}
