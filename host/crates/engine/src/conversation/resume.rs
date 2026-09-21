use super::{runtime::Runtime, stream};
use crate::Engine;
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Arc};

impl Engine {
    /// Local Desktop action only. The caller serializes actions; no caller-supplied
    /// account, folder, policy or thread ID can replace the saved identity.
    pub fn resume_desktop_conversation(&self, id: &str) -> Result<Value, String> {
        let (cwd, thread, generation, params, old_runtime) = {
            let mut state = self.shared.lock();
            let session = state.session(id)?;
            if session.meta.kind != "codex" || !self.conversation_launch.account {
                return Err("This saved conversation does not support Desktop resume".into());
            }
            let project = state.resolve_project(&session.meta.project_id)?;
            if std::fs::canonicalize(&project.path).map_err(|e| e.to_string())? != project.path {
                return Err("Restore this project's original folder before resuming".into());
            }
            let c = state
                .conversations
                .get(id)
                .ok_or("Conversation not found")?;
            if c.runtime.as_ref().is_some_and(|r| !r.exited()) && c.process_state == "running" {
                return Ok(json!(session.meta));
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
            if c.thread_id.is_empty() {
                return Err(
                    "No provider thread was saved. Your saved messages remain available.".into(),
                );
            }
            let cwd = PathBuf::from(
                c.working_directory
                    .as_ref()
                    .ok_or("Saved working folder is unavailable")?,
            );
            if std::fs::canonicalize(&cwd)
                .map_err(|e| format!("Restore the saved working folder: {e}"))?
                != cwd
            {
                return Err("The saved working folder changed; restore it before resuming".into());
            }
            let thread = c.thread_id.clone();
            let mut params = json!({"threadId":thread,"cwd":cwd,"excludeTurns":true});
            // The provider's saved thread carries its policy; explicit effective
            // settings keep the latest model/effort selected in Vibyra.
            if !c.settings["model"].is_null() {
                params["model"] = c.settings["model"].clone();
            }
            if !c.settings["effort"].is_null() {
                params["config"] = json!({"model_reasoning_effort":c.settings["effort"]});
            }
            if !c.settings["approvalPolicy"].is_null() {
                params["approvalPolicy"] = c.settings["approvalPolicy"].clone();
            }
            let sandbox = match c.settings["sandbox"]["type"].as_str() {
                Some("dangerFullAccess") => Some("danger-full-access"),
                Some("workspaceWrite") => Some("workspace-write"),
                Some("readOnly") => Some("read-only"),
                _ => None,
            };
            if let Some(sandbox) = sandbox {
                params["sandbox"] = json!(sandbox);
            }
            let generation = uuid::Uuid::new_v4().to_string();
            let c = state.conversations.get_mut(id).unwrap();
            c.restore();
            c.generation = generation.clone();
            let old_runtime = c.runtime.take();
            let session = state.sessions.get_mut(id).unwrap();
            session.meta.status = "interrupted".into();
            session.generation = generation.clone();
            session.lease = None;
            (cwd, thread, generation, params, old_runtime)
        };
        if let Some(old) = old_runtime {
            old.stop();
        }
        let weak = Arc::downgrade(&self.shared);
        let event_id = id.to_owned();
        let runtime = Runtime::spawn(&cwd, &self.conversation_launch, move |event| {
            if let Some(shared) = weak.upgrade() {
                stream::receive_generation(&shared, &event_id, &generation, event);
            }
        })?;
        let effective = resume_thread(&runtime, params)?;
        if effective["thread"]["id"].as_str() != Some(&thread) || runtime.exited() {
            return Err(
                "Codex did not restore the saved thread. Its saved history is unchanged.".into(),
            );
        }
        *runtime.started.lock() = effective.clone();
        let mut state = self.shared.lock();
        if runtime.exited() {
            return Err(
                "Codex stopped while restoring. Your saved history is still available.".into(),
            );
        }
        let c = state
            .conversations
            .get_mut(id)
            .ok_or("Conversation disappeared")?;
        c.runtime = Some(runtime);
        c.process_state = "running".into();
        c.turn_state = "idle".into();
        c.turn_id = None;
        c.active_submission = None;
        for (target, source) in [
            ("model", "model"),
            ("effort", "reasoningEffort"),
            ("approvalPolicy", "approvalPolicy"),
            ("sandbox", "sandbox"),
        ] {
            if !effective[source].is_null() {
                c.settings[target] = effective[source].clone();
            }
        }
        let session = state.sessions.get_mut(id).ok_or("Session disappeared")?;
        session.meta.status = "running".into();
        let result = json!(session.meta);
        if let Err(error) = state.journal.save(state.session(id)?) {
            super::storage_failure(&mut state, id, &error);
            return Err(error);
        }
        super::publish(&mut state, id, None)?;
        state.emit("host.changed", json!({}));
        Ok(result)
    }
}

// A terminated provider may take a moment to release its OS writer lock.
// Retry only a definitive lock refusal, never an unknown acknowledgement.
fn resume_thread(runtime: &Runtime, params: Value) -> Result<Value, String> {
    for attempt in 0..6 {
        match runtime.request("thread/resume", params.clone()) {
            Ok(value) => return Ok(value),
            Err(error)
                if !error.unknown
                    && error.message.contains("already has an active writer")
                    && attempt < 5 =>
            {
                std::thread::sleep(std::time::Duration::from_millis(100 << attempt));
            }
            Err(error) => return Err(error.into()),
        }
    }
    unreachable!()
}
