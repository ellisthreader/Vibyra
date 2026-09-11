mod acknowledgement;
mod actions;
mod batching;
mod create;
mod deltas;
pub(crate) mod model;
mod normalize;
mod question_tool;
mod requests;
mod runtime;
mod storage;
mod stream;

use crate::{
    state::{Session, State},
    text, Engine,
};
use serde_json::{json, Value};

pub(crate) fn authorize(session: &Session, device: &str, params: &Value) -> Result<(), String> {
    if session.meta.status != "running" {
        return Err("This conversation is no longer running".into());
    }
    if session.meta.project_id != text(params, "projectId")? {
        return Err("Wrong conversation project".into());
    }
    if session.generation != text(params, "generation")? {
        return Err("Stale conversation generation".into());
    }
    let lease = session.lease.as_ref().ok_or("Take control to respond")?;
    if lease.device != device || lease.token != text(params, "lease")? {
        return Err("Conversation control belongs to another lease".into());
    }
    Ok(())
}
pub(crate) fn publish(state: &mut State, id: &str, item: Option<Value>) -> Result<(), String> {
    let project = state.session(id)?.meta.project_id.clone();
    let conversation = state
        .conversations
        .get_mut(id)
        .ok_or("Conversation not found")?;
    let event = conversation.update(id, &project, item);
    state.journal.save_conversation(id, conversation)?;
    state.emit("conversation.updated", event);
    Ok(())
}
impl Engine {
    pub(crate) fn conversation_handle(
        &self,
        device: &str,
        method: &str,
        params: &Value,
    ) -> Result<Value, String> {
        let id = text(params, "sessionId")?;
        match method {
            "conversation.snapshot" => {
                let state = self.shared.lock();
                let session = state.session(id)?;
                let conversation = state
                    .conversations
                    .get(id)
                    .ok_or("Structured conversation is unavailable for this session")?;
                Ok(conversation.snapshot(
                    id,
                    &session.meta.project_id,
                    params["beforeCursor"].as_u64(),
                ))
            }
            "conversation.events" => {
                let state = self.shared.lock();
                let c = state
                    .conversations
                    .get(id)
                    .ok_or("Conversation not found")?;
                let after = params["afterCursor"]
                    .as_u64()
                    .ok_or("missing afterCursor")?;
                let mut events = Vec::new();
                let mut size = 0;
                for event in c
                    .events
                    .iter()
                    .filter(|e| e["cursor"].as_u64().unwrap_or(0) > after)
                {
                    size += serde_json::to_vec(event).map_err(|e| e.to_string())?.len();
                    if size > 45 * 1024 {
                        break;
                    }
                    events.push(event);
                }
                Ok(
                    json!({"events":events,"cursor":c.cursor,"generation":c.generation,
                    "resetRequired":after > c.cursor || c.events.first().is_some_and(|e| after.saturating_add(1) < e["cursor"].as_u64().unwrap_or(0))}),
                )
            }
            "turn.submissionStatus" => {
                let state = self.shared.lock();
                let c = state
                    .conversations
                    .get(id)
                    .ok_or("Conversation not found")?;
                let submission = text(params, "submissionId")?;
                let Some(receipt) = c.receipts.get(submission) else {
                    return Ok(json!({"submissionId":submission,"status":"notFound"}));
                };
                if receipt["device"] != device {
                    return Err("Submission belongs to another device".into());
                }
                Ok(
                    json!({"status":receipt["status"],"turnId":receipt["turnId"],"submissionId":params["submissionId"]}),
                )
            }
            "turn.submit" => self.submit_turn(device, params),
            "turn.interrupt" => self.interrupt_turn(device, params),
            "decision.resolve" | "question.answer" => self.resolve_request(device, method, params),
            _ => Err("Conversation method is not supported".into()),
        }
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod tests_recovery;

#[cfg(test)]
mod tests_errors;

#[cfg(test)]
mod tests_output;
