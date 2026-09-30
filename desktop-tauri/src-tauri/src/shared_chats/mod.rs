mod cli;
mod create;
pub mod desktop_stream;
#[cfg(all(test, unix))]
mod launch_tests;
mod lifecycle;
mod preview;
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
    wake: stream::Wake,
    preview: Mutex<Option<preview::Providers>>,
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
            preview: Mutex::new(None),
        })
    }
    fn check(&self) -> Result<(), String> {
        self.error.clone().map_or(Ok(()), Err)
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
mod lookup;
#[cfg(all(test, unix))]
mod native_cli_tests;
#[cfg(test)]
mod phone_resume_tests;
#[cfg(all(test, unix))]
mod resume_tests;
#[cfg(test)]
mod unused_resume_tests;
