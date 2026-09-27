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
        self.create_configured_conversation(device, params, None)
    }
    pub(crate) fn create_configured_conversation(
        &self,
        device: &str,
        params: &Value,
        options: Option<crate::DesktopConversationOptions>,
    ) -> Result<Value, String> {
        let mut identity = serde_json::to_value(&options).map_err(|e| e.to_string())?;
        // A fresh preflight approval may change on retry; it must not create
        // another session after the original launch was already accepted.
        if identity.is_object() {
            identity["safeSnapshotFingerprint"] = Value::Null;
        }
        let request = text(params, "requestId")?;
        identifier(request)?;
        let title = text(params, "title")?.trim();
        if title.is_empty() || title.len() > 160 || title.chars().any(char::is_control) {
            return Err("title must contain 1–160 bytes without control characters".into());
        }
        let launch = self.conversation_launch.for_kind(text(params, "kind")?)?;
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
                || state
                    .conversations
                    .get(&s.meta.id)
                    .is_none_or(|c| c.launch_options != identity)
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
        let (cwd, mut thread_params) = options.unwrap_or_default().prepare(&project.path)?;
        let id = uuid::Uuid::new_v4().to_string();
        let meta = Metadata {
            id: id.clone(),
            project_id: project.id,
            title: title.into(),
            kind: launch.provider.clone(),
            status: "interrupted".into(),
            created_at: now(),
            runner: Some("conversation".into()),
        };
        let session = Session::restored(meta, device.into(), request.into());
        let mut conversation = Conversation::new(session.generation.clone());
        conversation.launch_options = identity;
        conversation.working_directory = Some(cwd.to_string_lossy().into_owned());
        state.journal.save(&session)?;
        state.journal.save_conversation(&id, &conversation)?;
        let generation = session.generation.clone();
        state.sessions.insert(id.clone(), session);
        state.conversations.insert(id.clone(), conversation);
        drop(state);
        let weak = Arc::downgrade(&self.shared);
        let event_id = id.clone();
        let receive = move |event| {
            if let Some(shared) = weak.upgrade() {
                super::stream::receive_generation(&shared, &event_id, &generation, event);
            }
        };
        let runtime = if launch.provider == "codex" {
            Runtime::spawn(&cwd, &launch, receive)
        } else {
            super::provider_runtime::spawn(&cwd, &launch.provider, &launch, receive)
        };
        let initialized = runtime.and_then(|runtime| {
            if launch.provider == "codex" { thread_params.as_object_mut().unwrap().extend(json!({
                "approvalsReviewer":"user","ephemeral":false,
                "dynamicTools":[super::question_tool::spec()],
                "developerInstructions":"Present concise useful updates. Use the vibyra_ask_user tool when user direction is required; it displays a native question card and waits for their answer. Do not use it for execution approval. Do not narrate routine commands."}).as_object().unwrap().clone()); }
            let result = runtime.request("thread/start", thread_params)?;
            *runtime.started.lock() = result.clone();
            let thread = result["thread"]["id"].as_str().ok_or("Codex did not create a thread")?.to_owned();
            Ok((runtime,thread,result))
        });
        let mut state = self.shared.lock();
        match initialized {
            Ok((runtime, thread, effective)) => {
                let c = state
                    .conversations
                    .get_mut(&id)
                    .ok_or("Conversation disappeared")?;
                c.runtime = Some(runtime);
                c.thread_id = thread;
                c.settings = json!({"provider":launch.provider,"model":effective["model"],"effort":effective["reasoningEffort"],
                    "approvalPolicy":effective["approvalPolicy"],"sandbox":effective["sandbox"],
                    "revision":0,"appliesTo":"nextTurn"});
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
