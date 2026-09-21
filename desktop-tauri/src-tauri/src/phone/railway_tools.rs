use super::{railway, railway_resources};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{path::PathBuf, process::Command, sync::Arc, time::Duration};
use vibyra_engine::Engine;

pub struct RailwayTools {
    directory: PathBuf,
    slot: Mutex<Option<Slot>>,
}
struct Slot {
    account: String,
    engine: Arc<Engine>,
    project: Value,
}
impl RailwayTools {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            slot: Mutex::new(None),
        }
    }
    pub fn project(&self, status: &Value) -> Option<Value> {
        let mut slot = self.slot.lock();
        if status["status"] != "ready" {
            *slot = None;
            return None;
        }
        let account = status["account"].as_str()?;
        if slot.as_ref().is_some_and(|s| s.account == account) {
            return slot.as_ref().map(|s| s.project.clone());
        }
        *slot = None;
        let mut nonce = [0u8; 16];
        getrandom::fill(&mut nonce).ok()?;
        let unique: String = nonce.iter().map(|b| format!("{b:02x}")).collect();
        let directory = self.directory.join("railway").join(unique);
        // Stable project identity avoids counting every Mac restart as another
        // paid-plan project. Fresh journals still invalidate previous bindings.
        let root = self.directory.join("railway").join("resources");
        std::fs::create_dir_all(&root).ok()?;
        let engine = Arc::new(
            Engine::new_read_only(directory.join("journal"), "Railway".into(), root).ok()?,
        );
        let state = engine.handle("desktop", "host.state", json!({})).ok()?;
        let mut project = state["projects"][0].clone();
        project["kind"] = json!("railway");
        project["filesAvailable"] = json!(true);
        *slot = Some(Slot {
            account: account.into(),
            engine,
            project: project.clone(),
        });
        Some(project)
    }
    pub fn dispatch(
        &self,
        device: &str,
        method: &str,
        params: &Value,
    ) -> Option<Result<Value, String>> {
        let slot = self.slot.lock();
        let slot = slot.as_ref()?;
        if params["projectId"] != slot.project["id"] {
            return None;
        }
        let engine = slot.engine.clone();
        let account = slot.account.clone();
        // The engine checks binding, decision, expiry and replay before the CLI callback.
        Some(engine.external_read(device, method, params, |operation, p| {
            let binary = railway::locate().ok_or("Railway CLI is unavailable on the Mac")?;
            let identity = railway::run(Command::new(&binary).arg("whoami"), Duration::from_secs(3))
                .and_then(|s| railway::parse_whoami(&s));
            if identity.as_deref() != Some(account.as_str()) {
                return Err("Railway account changed or signed out. Refresh integrations and start a new chat.".into());
            }
            railway_resources::read(operation, p, |args| {
                railway::run(Command::new(&binary).args(args), Duration::from_secs(8))
                    .ok_or_else(|| "Railway read failed, timed out, or exceeded its size limit. Check CLI access on the Mac.".into())
            })
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn readiness_publishes_stable_projects_but_account_changes_invalidate_bindings() {
        let state = tempfile::tempdir().unwrap();
        let tools = RailwayTools::new(state.path().into());
        assert!(tools.project(&Value::Null).is_none());
        let ready = json!({"status":"ready","account":"one@example.com"});
        let first = tools.project(&ready).unwrap();
        assert_eq!(first["kind"], "railway");
        assert_eq!(tools.project(&ready).unwrap()["id"], first["id"]);
        let scope = json!({"projectId":first["id"],"accountToken":uuid::Uuid::new_v4().to_string(),"chatId":uuid::Uuid::new_v4().to_string()});
        let result = tools
            .dispatch("phone-one", "vibes.bind", &scope)
            .unwrap()
            .unwrap();
        let mut request = scope.clone();
        request["binding"] = result["binding"].clone();
        request["operation"] = json!("read_file");
        request["path"] = json!("projects.json");
        request["toolId"] = json!(uuid::Uuid::new_v4().to_string());
        request["decision"] = json!("decline");
        request["expiresAt"] = json!(chrono::Utc::now().timestamp() + 600);
        assert!(tools
            .dispatch("phone-two", "vibes.tool", &request)
            .unwrap()
            .is_err());
        assert_eq!(
            tools
                .dispatch("phone-one", "vibes.tool", &request)
                .unwrap()
                .unwrap()["declined"],
            true
        );
        assert!(tools
            .dispatch("phone-one", "project.read", &scope)
            .unwrap()
            .is_err());
        let second = tools
            .project(&json!({"status":"ready","account":"two@example.com"}))
            .unwrap();
        assert_eq!(second["id"], first["id"]);
        assert!(tools
            .dispatch("phone-one", "vibes.tool", &request)
            .unwrap()
            .is_err());
        assert!(tools.project(&json!({"status":"signedOut"})).is_none());
        let restored = RailwayTools::new(state.path().into());
        assert_eq!(restored.project(&ready).unwrap()["id"], first["id"]);
        assert!(restored
            .dispatch("phone-one", "vibes.tool", &request)
            .unwrap()
            .is_err());
    }
}
