use parking_lot::Mutex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use vibyra_engine::Engine;

/// The one folder, if any, this Mac exposes to its phone for reading only - an
/// Obsidian vault, or any other folder of notes. One vault for the whole Mac,
/// chosen once in Settings, not one per account the way `SharedChats` keeps a
/// project per account: a vault has no account to scope it to, only a folder.
///
/// Read-only end to end: `Engine::new_read_only` refuses `write_file` itself
/// (`vibes_tools.rs`), so a bug in the routing here cannot turn into a write.
pub struct Vault {
    state_dir: PathBuf,
    slot: Mutex<Option<Slot>>,
}
struct Slot {
    path: PathBuf,
    engine: Arc<Engine>,
    project: Value,
}

impl Vault {
    /// Restores the previously chosen folder, if any and if it still exists.
    /// A folder that moved or was deleted since is silently left unset: the
    /// person sees no vault chosen and picks again, rather than an error at launch.
    pub fn new(state_dir: PathBuf) -> Arc<Self> {
        let vault = Arc::new(Self {
            state_dir: state_dir.clone(),
            slot: Mutex::new(None),
        });
        if let Some(path) = load(&state_dir) {
            let _ = vault.choose(path);
        }
        vault
    }

    pub fn choose(&self, path: PathBuf) -> Result<Value, String> {
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Vault")
            .to_string();
        // A fresh subdirectory every choice, never the prior one: the old
        // Engine's journal releases its own lock asynchronously as it tears
        // down, and reusing its directory here would race that teardown.
        let mut suffix = [0u8; 8];
        getrandom::fill(&mut suffix).map_err(|e| e.to_string())?;
        let directory = self.state_dir.join(format!(
            "vault-{}",
            suffix
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        ));
        let engine = Arc::new(Engine::new_read_only(directory, name, path.clone())?);
        let host = engine.handle("desktop", "host.state", json!({}))?;
        let mut project = host["projects"][0].clone();
        if project["id"].as_str().is_none() {
            return Err("That folder could not be opened as a vault.".into());
        }
        project["filesAvailable"] = json!(true);
        // Named for what it is, so the phone can show it as a vault rather than
        // inferring one from a read-only folder.
        project["kind"] = json!("vault");
        save(&self.state_dir, &path)?;
        *self.slot.lock() = Some(Slot {
            path,
            engine,
            project: project.clone(),
        });
        Ok(project)
    }

    pub fn clear(&self) -> Result<(), String> {
        *self.slot.lock() = None;
        clear(&self.state_dir)
    }

    /// The vault's own project entry, for `host.state`'s `projects` list.
    pub fn project(&self) -> Option<Value> {
        self.slot.lock().as_ref().map(|s| s.project.clone())
    }

    pub(super) fn state_dir(&self) -> PathBuf {
        self.state_dir.clone()
    }

    pub fn path(&self) -> Option<PathBuf> {
        self.slot.lock().as_ref().map(|s| s.path.clone())
    }

    /// The engine to answer a call naming this project id, or none when the
    /// call is for some other project (a coding session, an unapproved id).
    pub fn route(&self, project_id: &str) -> Option<Arc<Engine>> {
        let guard = self.slot.lock();
        let slot = guard.as_ref()?;
        (slot.project["id"] == project_id).then(|| slot.engine.clone())
    }

    /// `None` when this call is not the vault's to answer - every other
    /// project method (a coding session on the standalone Host) is not this
    /// adapter's to serve, today exactly as before a vault could exist.
    pub fn dispatch(
        &self,
        device: &str,
        method: &str,
        params: &Value,
    ) -> Option<Result<Value, String>> {
        if !matches!(
            method,
            "vibes.bind" | "vibes.tool" | "project.files" | "project.read" | "project.search"
        ) {
            return None;
        }
        let id = params["projectId"].as_str()?;
        let engine = self.route(id)?;
        Some(engine.handle(device, method, params.clone()))
    }
}

#[cfg(test)]
impl Vault {
    /// No vault chosen, for a test with nothing to say about one.
    pub fn empty() -> Arc<Self> {
        Self::new(tempfile::tempdir().expect("temp dir").keep())
    }
}

fn file(state_dir: &Path) -> PathBuf {
    state_dir.join("vault.json")
}
fn load(state_dir: &Path) -> Option<PathBuf> {
    let value: Value = std::fs::read(file(state_dir))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())?;
    value["path"].as_str().map(PathBuf::from)
}
fn save(state_dir: &Path, path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(state_dir).map_err(|e| e.to_string())?;
    let tmp = state_dir.join("vault.pending");
    std::fs::write(&tmp, json!({"path": path}).to_string()).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, file(state_dir)).map_err(|e| e.to_string())
}
fn clear(state_dir: &Path) -> Result<(), String> {
    match std::fs::remove_file(file(state_dir)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn choosing_publishes_a_read_only_project_and_routes_only_its_own_calls() {
        let root = tempfile::tempdir().unwrap();
        let state = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("Home.md"), "hello").unwrap();
        let vault = Vault::new(state.path().into());
        assert!(vault.project().is_none());
        let project = vault.choose(root.path().into()).unwrap();
        assert_eq!(project["filesAvailable"], true);
        let id = project["id"].as_str().unwrap().to_owned();
        assert!(vault.route(&id).is_some());
        assert!(vault.route("something-else").is_none());
        vault.clear().unwrap();
        assert!(vault.project().is_none());
        assert!(vault.route(&id).is_none());
    }

    #[test]
    fn a_chosen_vault_survives_being_recreated_from_the_same_state_dir() {
        let root = tempfile::tempdir().unwrap();
        let state = tempfile::tempdir().unwrap();
        let project = {
            let first = Vault::new(state.path().into());
            first.choose(root.path().into()).unwrap()
        };
        // The prior Vault (and its Engine's own sqlite connection) must be gone
        // before the next one opens the same state dir, exactly as an actual
        // restart would leave it - two live Engines over one state dir at once
        // is not a shape this ever runs in.
        let restored = Vault::new(state.path().into());
        assert_eq!(restored.project().unwrap()["id"], project["id"]);
    }
}
