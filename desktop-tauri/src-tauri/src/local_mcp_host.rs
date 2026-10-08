//! The one local-MCP supervisor of this app run: where the servers file lives,
//! the keychain behind its secret values, and the quit hook that stops every
//! server and everything it started. The definitions and the process
//! lifecycle live in `vibyra_core::local_mcp`; nothing here is shown to the model.

use crate::secret_store::SecretStore;
use crate::state::AppState;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Manager};
use vibyra_core::local_mcp::{Limits, SecretSource, Supervisor};

static SUPERVISOR: OnceLock<Arc<Supervisor>> = OnceLock::new();

pub fn supervisor() -> &'static Arc<Supervisor> {
    SUPERVISOR.get_or_init(|| {
        let supervisor = Supervisor::new(Limits::default(), Arc::new(Keychain));
        supervisor.spawn_janitor();
        supervisor
    })
}

/// Quit: stop every server and its process group. Does not start the supervisor.
pub fn shutdown() {
    if let Some(supervisor) = SUPERVISOR.get() {
        supervisor.stop_all();
    }
}

/// The folder holding `local-mcp.json`, next to settings.json.
pub fn dir(app: &AppHandle) -> Option<PathBuf> {
    app.state::<AppState>()
        .settings_path
        .parent()
        .map(PathBuf::from)
}

/// `local-mcp/<server id>/<VARIABLE>` in the credential store, under the generic named namespace.
pub fn secret_account(server_id: &str, name: &str) -> String {
    format!("local-mcp/{server_id}/{name}")
}

struct Keychain;

impl SecretSource for Keychain {
    fn read(&self, server_id: &str, name: &str) -> Result<Option<String>, String> {
        SecretStore.read_named(&secret_account(server_id, name))
    }
}

pub fn write_secret(server_id: &str, name: &str, value: Option<&str>) -> Result<(), String> {
    SecretStore.write_named(&secret_account(server_id, name), value)
}

pub fn has_secret(server_id: &str, name: &str) -> bool {
    SecretStore
        .read_named(&secret_account(server_id, name))
        .ok()
        .flatten()
        .is_some()
}
