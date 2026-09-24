use super::SharedChats;
use serde_json::{json, Value};

impl SharedChats {
    pub fn lookup_create(
        &self,
        project_id: &str,
        account_id: &str,
        provider: &str,
        request_id: &str,
    ) -> Result<Value, String> {
        self.check()?;
        let _action = self.local_action.lock();
        let slots = self.slots.lock();
        let Some(slot) = slots.iter().find(|slot| {
            slot.project.project_id == project_id
                && slot.project.account_id == account_id
                && slot.project.provider == provider
        }) else {
            return Ok(Value::Null);
        };
        slot.engine.handle(
            "desktop",
            "session.lookup_request",
            json!({"projectId":project_id,"requestId":request_id}),
        )
    }
}
