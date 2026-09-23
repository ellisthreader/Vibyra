mod acknowledgement;
mod actions;
mod archive;
mod attachments;
mod batching;
mod commands;
mod create;
mod deltas;
pub(crate) mod model;
mod normalize;
mod observed;
mod permission_request;
mod policy;
mod provider_runtime;
mod question_tool;
mod requests;
mod resume;
mod runtime;
mod runtime_output;
mod settings;
mod storage;
mod stream;
mod terminal_attachment;
#[cfg(test)]
mod terminal_attachment_tests;
mod terminal_bridge;
#[cfg(all(test, unix))]
mod terminal_bridge_tests;
mod terminal_events;
#[cfg(unix)]
mod terminal_socket;

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
    let result = publish_inner(state, id, item);
    if let Err(error) = &result {
        storage_failure(state, id, error);
    }
    result
}
pub(super) fn storage_failure(state: &mut State, id: &str, error: &str) {
    if let Some(c) = state.conversations.get_mut(id) {
        if let Some(runtime) = &c.runtime {
            runtime.stop();
        }
        c.restore();
    }
    if let Some(session) = state.sessions.get_mut(id) {
        session.meta.status = "interrupted".into();
        session.lease = None;
    }
    state.emit(
        "host.warning",
        json!({"message":format!("Conversation storage failed: {error}")}),
    );
}
fn publish_inner(state: &mut State, id: &str, item: Option<Value>) -> Result<(), String> {
    let project = state.session(id)?.meta.project_id.clone();
    let mut item = item;
    if let Some(value) = &mut item {
        state.journal.original_position(id, value)?;
        state.journal.prepare_artifact(id, value)?;
    }
    let conversation = state
        .conversations
        .get_mut(id)
        .ok_or("Conversation not found")?;
    let mut event = conversation.update(id, &project, item);
    state.journal.save_conversation(id, conversation)?;
    archive::public_item(&mut event["item"]);
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
                let mut snapshot = conversation.snapshot(
                    id,
                    &session.meta.project_id,
                    params["beforeCursor"].as_u64(),
                );
                let (items, more) = state
                    .journal
                    .history_page(id, params["beforeCursor"].as_u64())?;
                snapshot["items"] = json!(items);
                snapshot["hasMore"] = json!(more);
                if let Some(pending) = snapshot["pending"].as_array_mut() {
                    pending.iter_mut().for_each(archive::public_item);
                }
                Ok(snapshot)
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
                    let mut event = event.clone();
                    archive::public_item(&mut event["item"]);
                    size += serde_json::to_vec(&event).map_err(|e| e.to_string())?.len();
                    if size > 45 * 1024 {
                        break;
                    }
                    events.push(event);
                }
                Ok(
                    json!({"events":events,"cursor":c.cursor,"generation":c.generation,
                    "resetRequired":(c.events.is_empty() && after != c.cursor) || after > c.cursor || c.events.first().is_some_and(|e| after.saturating_add(1) < e["cursor"].as_u64().unwrap_or(0))}),
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
            "conversation.artifact" => {
                let state = self.shared.lock();
                state.session(id)?;
                state.journal.artifact(id, params)
            }
            "conversation.commands"
            | "conversation.status"
            | "conversation.models"
            | "conversation.usage" => self.conversation_command(method, params),
            "conversation.attachment" => self.conversation_attachment(device, params),
            "conversation.trust.revoke" => self.revoke_conversation_trust(device, params),
            "conversation.settings" => self.conversation_settings(device, params),
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
mod tests_artifacts;
#[cfg(test)]
mod tests_recovery;

#[cfg(test)]
mod tests_errors;

#[cfg(test)]
mod tests_output;

#[cfg(test)]
mod tests_redesign;

#[cfg(test)]
mod tests_storage_failure;

#[cfg(test)]
mod tests_policy;
