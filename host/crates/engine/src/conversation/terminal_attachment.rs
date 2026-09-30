use crate::{state::Shared, Engine};
use serde_json::{json, Value};
use std::sync::Arc;
use vibyra_core::pty::LaunchSpec;

impl Engine {
    /// Local embedding only: this endpoint and launch spec never enter the phone protocol.
    pub fn codex_terminal(&self, id: &str) -> Result<LaunchSpec, String> {
        if self.conversation_launch.provider != "codex" {
            return Err("Native attachment is only available for Codex".into());
        }
        let (runtime, thread, cwd) = {
            let state = self.shared.lock();
            let c = state
                .conversations
                .get(id)
                .ok_or("Conversation not found")?;
            if c.process_state != "running" {
                return Err("This conversation is saved. Open Chat to read its history.".into());
            }
            (
                c.runtime.clone().ok_or("Codex process is unavailable")?,
                c.thread_id.clone(),
                c.working_directory.clone(),
            )
        };
        let shared = Arc::downgrade(&self.shared);
        let session = id.to_owned();
        let endpoint = runtime.attach(
            thread.clone(),
            Arc::new(move |value| {
                let shared = shared.upgrade().ok_or("Conversation has closed")?;
                before_request(&shared, &session, value)
            }),
        )?;
        {
            let state = self.shared.lock();
            if let (Some(c), Some(bridge)) =
                (state.conversations.get(id), runtime.bridge.lock().as_ref())
            {
                // An empty, already running thread has no resumable rollout yet.
                // Its authoritative start response is the complete initial state.
                if c.items.is_empty() && c.turn_id.is_none() {
                    *bridge.initial.lock() = Some(runtime.started.lock().clone());
                }
                for item in c.items.iter().filter(|i| i["status"] == "pending") {
                    bridge.provider(&json!({"id":item["rpcId"],"method":item["method"],"params":item["action"]}));
                }
            }
        }
        Ok(LaunchSpec {
            program: self
                .conversation_launch
                .program
                .to_string_lossy()
                .into_owned(),
            args: vec![
                "resume".into(),
                "--remote".into(),
                endpoint,
                thread,
                "-c".into(),
                "check_for_update_on_startup=false".into(),
            ],
            env: self.conversation_launch.environment.clone(),
            env_remove: [
                "OPENAI_API_KEY",
                "CODEX_API_KEY",
                "OPENROUTER_API_KEY",
                "ANTHROPIC_API_KEY",
                "CLAUDE_CODE_OAUTH_TOKEN",
            ]
            .map(str::to_owned)
            .to_vec(),
            cwd,
            rows: 30,
            cols: 100,
        })
    }
}

pub(super) fn before_request(shared: &Shared, id: &str, value: &mut Value) -> Result<(), String> {
    let method = value["method"].as_str().unwrap_or("").to_owned();
    if method == "thread/resume" {
        // The TUI must adopt this thread's actual account/worktree/model/policy.
        value["params"] = json!({"threadId":value["params"]["threadId"],"excludeTurns":true,
            "initialTurnsPage":value["params"]["initialTurnsPage"]});
        return Ok(());
    }
    let mut state = shared.lock();
    if state.session(id)?.meta.status != "running" {
        return Err("Conversation has stopped".into());
    }
    if method == "vibyra/terminalFailed" {
        let c = state
            .conversations
            .get_mut(id)
            .ok_or("Conversation not found")?;
        if c.turn_id.is_none() {
            c.turn_state = "failed".into();
        }
        return super::publish(&mut state, id, None);
    }
    if !matches!(
        method.as_str(),
        "turn/start"
            | "turn/steer"
            | "turn/interrupt"
            | "thread/compact/start"
            | "thread/settings/update"
            | ""
    ) {
        return Ok(());
    }
    let c = state
        .conversations
        .get_mut(id)
        .ok_or("Conversation not found")?;
    if value["params"]["cwd"]
        .as_str()
        .is_some_and(|cwd| Some(cwd) != c.working_directory.as_deref())
    {
        return Err("Use Vibyra's project controls to change the working directory".into());
    }
    if method == "turn/start" {
        if matches!(c.turn_state.as_str(), "running" | "waiting") {
            return Err("A turn is already running; wait or interrupt it first".into());
        }
        c.active_submission = None;
        c.turn_id = None;
        c.turn_state = "running".into();
        for (from, to) in [
            ("model", "model"),
            ("effort", "effort"),
            ("approvalPolicy", "approvalPolicy"),
            ("sandboxPolicy", "sandbox"),
        ] {
            if !value["params"][from].is_null() {
                c.settings[to] = value["params"][from].clone();
            }
        }
        c.settings["revision"] = json!(c.settings["revision"].as_u64().unwrap_or(0) + 1);
        c.active_settings = c.settings.clone();
    }
    let item = if method.is_empty() {
        if let Some(mut item) = c.items.iter().find(|i| i["rpcId"] == value["id"]).cloned() {
            if item["status"] != "pending" {
                return Err("Request has already been answered".into());
            }
            item["status"] = json!("responding");
            item["decision"] = value["result"]["decision"].clone();
            item["decisionId"] = json!(format!("terminal:{}", uuid::Uuid::new_v4()));
            Some(item)
        } else {
            None
        }
    } else {
        None
    };
    // Local actions revoke the phone's lease, exactly as the Desktop composer does.
    state
        .sessions
        .get_mut(id)
        .ok_or("Conversation not found")?
        .lease = None;
    state.emit("conversation.controlChanged", json!({"sessionId":id}));
    super::publish(&mut state, id, item)
}
