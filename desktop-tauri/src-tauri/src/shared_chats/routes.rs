use super::SharedChats;
use serde_json::{json, Value};

pub fn readable(method: &str) -> bool {
    matches!(
        method,
        "conversation.snapshot"
            | "conversation.events"
            | "turn.submissionStatus"
            | "conversation.commands"
            | "conversation.status"
            | "conversation.models"
            | "conversation.usage"
            | "conversation.artifact"
    )
}
pub fn mutable(method: &str) -> bool {
    matches!(
        method,
        "conversation.attachment"
            | "conversation.trust.revoke"
            | "conversation.settings"
            | "turn.submit"
            | "turn.interrupt"
            | "decision.resolve"
            | "question.answer"
            | "session.stop"
    )
}
impl SharedChats {
    /// Explicit allowlist: the underlying Host can also read files/start shells.
    pub fn remote(
        &self,
        device: &str,
        method: &str,
        params: Value,
        typing: bool,
    ) -> Result<Value, String> {
        if !readable(method)
            && !mutable(method)
            && !matches!(method, "session.claim" | "session.release")
        {
            return Err("This action is unavailable for a shared conversation".into());
        }
        if !readable(method) && method != "session.release" && !typing {
            return Err("Typing from your phone is off. Turn it on in Desktop Settings > iPhone connection.".into());
        }
        // A phone may interrupt its turn, but only Desktop closes a shared session.
        if method == "session.stop" {
            return Err("Close this shared chat on Desktop".into());
        }
        if method == "conversation.trust.revoke" || params["decision"] == "acceptForProject" {
            return Err(crate::platform_text::for_computer(
                "Manage saved permission rules on your Mac",
                "Manage saved permission rules on your computer",
            )
            .into());
        }
        let id = params["sessionId"]
            .as_str()
            .ok_or("Select a shared conversation")?;
        self.engine(id)?.handle(device, method, params)
    }
    pub fn local(&self, method: &str, mut params: Value) -> Result<Value, String> {
        if method == "conversation.resume" {
            let id = params["sessionId"]
                .as_str()
                .ok_or("Select a saved conversation")?;
            let _action = self.local_action.lock();
            let engine = self.engine(id)?;
            {
                let slots = self.slots.lock();
                let slot = slots
                    .iter()
                    .find(|slot| slot.engine.owns_conversation(id))
                    .ok_or("Shared conversation not found")?;
                crate::provider_auth_registry::Registry::load()
                    .home(&slot.project.provider, &slot.project.account_id)?;
            }
            let snapshot =
                engine.handle("desktop", "conversation.snapshot", json!({"sessionId":id}))?;
            if snapshot["processState"] != "running" {
                self.cli.stop(id);
            }
            return engine.resume_desktop_conversation(id);
        }
        if !readable(method) && !mutable(method) {
            return Err("Unsupported shared chat action".into());
        }
        let id = params["sessionId"]
            .as_str()
            .ok_or("Select a shared conversation")?
            .to_owned();
        let engine = self.engine(&id)?;
        if readable(method) {
            return engine.handle("desktop", method, params);
        }
        let _action = self.local_action.lock();
        let snapshot =
            engine.handle("desktop", "conversation.snapshot", json!({"sessionId":id}))?;
        let claim = engine.claim_locally("desktop", &id)?;
        params["projectId"] = snapshot["projectId"].clone();
        params["generation"] = claim["generation"].clone();
        params["lease"] = claim["lease"].clone();
        let result = engine.handle("desktop", method, params);
        if method == "session.stop" && result.is_ok() {
            self.cli.stop(&id);
        }
        let _ = engine.handle(
            "desktop",
            "session.release",
            json!({"sessionId":id,"lease":claim["lease"]}),
        );
        result
    }
}
