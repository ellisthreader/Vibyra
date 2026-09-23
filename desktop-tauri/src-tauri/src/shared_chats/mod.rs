mod cli;
pub mod desktop_stream;
#[cfg(all(test, unix))]
mod launch_tests;
mod lifecycle;
mod registry;
mod routes;
mod stream;
#[cfg(test)]
mod tests;

use parking_lot::Mutex;
use registry::Project;
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Arc};
use vibyra_engine::Engine;

struct Slot {
    pub project: Project,
    pub engine: Arc<Engine>,
}
pub struct SharedChats {
    path: PathBuf,
    slots: Mutex<Vec<Slot>>,
    error: Option<String>,
    local_action: Mutex<()>,
    cli: cli::CliTerminals,
    /// Wakes `subscribe` threads when a project is added.
    wake: stream::Wake,
}

impl SharedChats {
    pub fn new(path: PathBuf) -> Arc<Self> {
        let loaded = registry::load(&path);
        let (slots, error) = match loaded {
            Ok(slots) => (slots, None),
            Err(error) => (vec![], Some(error)),
        };
        Arc::new(Self {
            path,
            slots: Mutex::new(slots),
            error,
            local_action: Mutex::new(()),
            cli: cli::CliTerminals::default(),
            wake: stream::Wake::default(),
        })
    }
    fn check(&self) -> Result<(), String> {
        self.error.clone().map_or(Ok(()), Err)
    }
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
    // Explicit identity and launch settings are retained together at this IPC boundary.
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
                let engine = registry::open(&self.path, &project)?;
                let mut projects: Vec<_> = slots.iter().map(|slot| slot.project.clone()).collect();
                projects.push(project.clone());
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
        match options {
            Some(options) => engine.create_desktop_conversation(params, options),
            None => engine.handle("desktop", "session.create", params),
        }
    }
    pub fn sessions(&self) -> Result<Vec<Value>, String> {
        self.check()?;
        let mut sessions = vec![];
        for slot in self.slots.lock().iter() {
            let mut cursor = Value::Null;
            loop {
                let page = slot.engine.handle(
                    "desktop",
                    "session.list",
                    json!({"limit":100,"cursor":cursor}),
                )?;
                for mut session in page["sessions"].as_array().cloned().unwrap_or_default() {
                    session["accountId"] = json!(slot.project.account_id);
                    sessions.push(session);
                }
                cursor = page["nextCursor"].clone();
                if cursor.is_null() {
                    break;
                }
            }
        }
        sessions.sort_by(|a, b| {
            (b["status"] == "running")
                .cmp(&(a["status"] == "running"))
                .then_with(|| b["createdAt"].as_str().cmp(&a["createdAt"].as_str()))
                .then_with(|| b["id"].as_str().cmp(&a["id"].as_str()))
        });
        Ok(sessions)
    }
    pub fn projects(&self) -> Vec<Value> {
        self.slots
            .lock()
            .iter()
            .map(|slot| {
                json!({"id":slot.project.project_id,
            "name":slot.project.name,"path":slot.project.root})
            })
            .collect()
    }
    pub fn owns(&self, id: &str) -> bool {
        self.slots
            .lock()
            .iter()
            .any(|slot| slot.engine.owns_conversation(id))
    }
    pub(crate) fn engine(&self, id: &str) -> Result<Arc<Engine>, String> {
        self.check()?;
        self.slots
            .lock()
            .iter()
            .find(|slot| slot.engine.owns_conversation(id))
            .map(|slot| slot.engine.clone())
            .ok_or_else(|| "Shared conversation not found".into())
    }
    pub fn disconnected(&self, device: &str) {
        for slot in self.slots.lock().iter() {
            slot.engine.disconnected(device);
        }
    }
    pub fn shutdown(&self) {
        self.cli.shutdown();
        for slot in self.slots.lock().iter() {
            slot.engine.shutdown_conversations();
        }
    }
}

#[cfg(all(test, unix))]
mod cli_tests;
#[cfg(all(test, unix))]
pub(crate) mod fixture;
#[cfg(all(test, unix))]
mod native_cli_tests;

#[cfg(all(test, unix))]
mod resume_tests;
