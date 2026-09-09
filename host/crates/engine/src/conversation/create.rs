use super::{model::Conversation, runtime::Runtime};
use crate::{
    identifier, now,
    state::{Metadata, Session},
    text, Engine,
};
use serde_json::{json, Value};
use std::sync::Arc;

impl Engine {
    pub(crate) fn create_conversation(
        &self,
        device: &str,
        params: &Value,
    ) -> Result<Value, String> {
        let request = text(params, "requestId")?;
        identifier(request)?;
        let title = text(params, "title")?.trim();
        if title.is_empty() || title.len() > 160 || title.chars().any(char::is_control) {
            return Err("title must contain 1–160 bytes without control characters".into());
        }
        if params["kind"] != "codex" {
            return Err("Structured conversations currently support Codex only".into());
        }
        let mut state = self.shared.lock();
        let project = state.resolve_project(text(params, "projectId")?)?.clone();
        if let Some(s) = state
            .sessions
            .values()
            .find(|s| s.owner == device && s.request == request)
        {
            if s.meta.project_id != project.id
                || s.meta.title != title
                || s.meta.runner.as_deref() != Some("conversation")
            {
                return Err("request ID was already used for a different action".into());
            }
            return Ok(json!(s.meta));
        }
        if state
            .sessions
            .values()
            .filter(|s| s.meta.status == "running")
            .count()
            >= 12
        {
            return Err("host has reached its 12 active session limit".into());
        }
        if std::fs::canonicalize(&project.path).map_err(|e| e.to_string())? != project.path {
            return Err("project root changed; approve it locally again".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let meta = Metadata {
            id: id.clone(),
            project_id: project.id,
            title: title.into(),
            kind: "codex".into(),
            status: "interrupted".into(),
            created_at: now(),
            runner: Some("conversation".into()),
        };
        let session = Session::restored(meta, device.into(), request.into());
        let conversation = Conversation::new(session.generation.clone());
        state.journal.save(&session)?;
        state.journal.save_conversation(&id, &conversation)?;
        state.sessions.insert(id.clone(), session);
        state.conversations.insert(id.clone(), conversation);
        drop(state);
        let weak = Arc::downgrade(&self.shared);
        let event_id = id.clone();
        let runtime = Runtime::spawn(&project.path, move |event| {
            if let Some(shared) = weak.upgrade() {
                super::stream::receive(&shared, &event_id, event);
            }
        });
        let initialized = runtime.and_then(|runtime| {
            let result = runtime.request("thread/start", json!({"cwd":project.path,"approvalPolicy":"on-request",
                "approvalsReviewer":"user","sandbox":"workspace-write","ephemeral":true,
                "dynamicTools":[super::question_tool::spec()],
                "developerInstructions":"Present concise useful updates. Use the vibyra_ask_user tool when user direction is required; it displays a native question card and waits for their answer. Do not use it for execution approval. Do not narrate routine commands."}))?;
            let thread = result["thread"]["id"].as_str().ok_or("Codex did not create a thread")?.to_owned();
            Ok((runtime,thread))
        });
        let mut state = self.shared.lock();
        match initialized {
            Ok((runtime, thread)) => {
                let c = state
                    .conversations
                    .get_mut(&id)
                    .ok_or("Conversation disappeared")?;
                c.runtime = Some(runtime);
                c.thread_id = thread;
                let session = state.sessions.get_mut(&id).ok_or("Session disappeared")?;
                session.meta.status = "running".into();
                let result = json!(session.meta);
                state.journal.save(state.session(&id)?)?;
                super::publish(&mut state, &id, None)?;
                state.emit("host.changed", json!({}));
                Ok(result)
            }
            Err(error) => {
                if let Some(c) = state.conversations.get_mut(&id) {
                    c.restore();
                }
                super::publish(&mut state, &id, None)?;
                Err(error)
            }
        }
    }
}
