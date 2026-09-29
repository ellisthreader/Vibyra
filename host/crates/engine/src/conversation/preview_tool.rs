use crate::state::Shared;
use serde_json::{json, Value};

pub(super) const NAME: &str = "vibyra_preview_status";
pub(super) const INSTRUCTIONS: &str = "Vibyra supports phone Live Preview of websites and project-owned Mac application windows. After launching software, use vibyra_preview_status to check the current conversation project's actual Preview state. A running process does not prove a window or phone frame exists. Start desktop apps with vibyra_run_app, never shell commands. If sharing is required, direct the user to Live preview on their phone; do not send phone users to the Mac Dock. Report waiting, permission or launch failures accurately. Only say the phone is displaying the application when the tool reports firstFrameDecoded. This tool cannot grant sharing or control. Never replace a requested native application with a website unless the user chooses it.";

pub(super) fn spec() -> Value {
    json!({"type":"function","name":NAME,"description":"Check live Preview readiness for this conversation's project and current controlling device. Read-only: does not launch, share or control any window.",
        "inputSchema":{"type":"object","additionalProperties":false,"properties":{}}})
}

/// Handle on the engine event worker, never while holding its state lock over OS discovery.
pub(super) fn receive(shared: &Shared, id: &str, generation: Option<&str>, value: &Value) -> bool {
    if value.get("id").is_none()
        || value["method"] != "item/tool/call"
        || value["params"]["tool"] != NAME
    {
        return false;
    }
    let context = {
        let state = shared.lock();
        let Some(c) = state.conversations.get(id) else {
            return true;
        };
        if generation.is_some_and(|g| g != c.generation)
            || value["params"]["threadId"] != c.thread_id
        {
            return true;
        }
        let Some(runtime) = c.runtime.clone() else {
            return true;
        };
        let Some(session) = state.sessions.get(id) else {
            return true;
        };
        let device = session
            .lease
            .as_ref()
            .map(|lease| lease.device.clone())
            .unwrap_or_else(|| "desktop".into());
        (
            runtime,
            state.preview_status.clone(),
            device,
            session.meta.project_id.clone(),
            c.generation.clone(),
        )
    };
    let (runtime, provider, device, project, epoch) = context;
    let result = provider
        .ok_or_else(|| {
            "Live Preview status is unavailable on this host. Do not claim phone readiness."
                .to_owned()
        })
        .and_then(|provider| provider(&device, &project));
    let state = shared.lock();
    if state
        .conversations
        .get(id)
        .is_none_or(|c| c.generation != epoch)
    {
        return true;
    }
    let success = result.is_ok();
    let text = result
        .map(|v| v.to_string())
        .unwrap_or_else(|error| json!({"state":"unavailable","message":error}).to_string());
    let _ = runtime.write(json!({"id":value["id"],"result":{"success":success,
        "contentItems":[{"type":"inputText","text":text}]}}));
    true
}

#[cfg(test)]
#[path = "preview_tool_tests.rs"]
mod tests;
