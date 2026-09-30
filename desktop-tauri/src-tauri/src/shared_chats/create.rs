use super::{
    lifecycle::check_effect,
    registry::{self, Project},
    SharedChats, Slot,
};
use serde_json::{json, Value};
use std::path::PathBuf;
impl SharedChats {
    pub fn create(
        &self,
        project_id: String,
        name: String,
        root: PathBuf,
        account_id: String,
        request_id: String,
        title: String,
    ) -> Result<Value, String> {
        self.create_configured(project_id, name, root, account_id, request_id, title, None)
    }
    #[allow(clippy::too_many_arguments)]
    pub fn create_configured(
        &self,
        project_id: String,
        name: String,
        root: PathBuf,
        account_id: String,
        request_id: String,
        title: String,
        options: Option<vibyra_engine::DesktopConversationOptions>,
    ) -> Result<Value, String> {
        self.check()?;
        let provider = options
            .as_ref()
            .and_then(|o| o.provider.as_deref())
            .unwrap_or("codex")
            .to_owned();
        if !matches!(provider.as_str(), "codex" | "claude" | "gemini") {
            return Err("Unsupported provider".into());
        }
        let _action = self.local_action.lock();
        check_effect()?;
        let engine = {
            let mut slots = self.slots.lock();
            if let Some(slot) = slots.iter().find(|slot| {
                slot.project.project_id == project_id
                    && slot.project.account_id == account_id
                    && slot.project.provider == provider
            }) {
                if slot.project.root != std::fs::canonicalize(&root).map_err(|e| e.to_string())? {
                    return Err("This project's folder changed. Restore its original folder before using its shared chats.".into());
                }
                slot.engine.clone()
            } else {
                if slots.len() >= 32 {
                    return Err(
                        "Shared chats support up to 32 project/account combinations.".into(),
                    );
                }
                let mut project = Project::new(project_id.clone(), name, root, account_id)?;
                project.provider = provider.clone();
                check_effect()?;
                let engine = registry::open(&self.path, &project)?;
                self.apply_preview(&engine);
                let mut projects: Vec<_> = slots.iter().map(|slot| slot.project.clone()).collect();
                projects.push(project.clone());
                check_effect()?;
                registry::save(&self.path, &projects)?;
                slots.push(Slot {
                    project,
                    engine: engine.clone(),
                });
                self.wake.slots_changed();
                engine
            }
        };
        let params = json!({"projectId":project_id,
            "requestId":request_id,"title":title,"kind":provider,"runner":"conversation"});
        check_effect()?;
        match options {
            Some(options) => engine.create_desktop_conversation(params, options),
            None => engine.handle("desktop", "session.create", params),
        }
    }
}
