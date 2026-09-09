pub mod address;
mod backend;
#[cfg(test)]
mod tests;
mod watch;

use address::{connection_address, default_address};
use backend::DesktopBackend;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};
use vibyra_core::pty::PtyManager;
use vibyra_host::EmbeddedHost;
pub use watch::watch;

/// A phone lists nearby computers by this name, so it has to be the one the
/// person would recognise on their own desk rather than the product's name.
fn computer_name() -> String {
    crate::account_device::hostname()
        .map(|name| name.trim_end_matches(".local").to_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Vibyra Desktop".into())
}

pub const NO_NETWORK: &str =
    "Connect this Mac to Wi-Fi or a private VPN. Vibyra will find the address itself.";

/// The iPhone connection is one switch. `enabled` is what the person asked for
/// and survives restarts; the listener address is detected, never typed, and is
/// re-detected whenever this Mac changes network.
pub struct PhoneConnection {
    pub host: Option<EmbeddedHost>,
    path: PathBuf,
    enabled: bool,
    address: String,
    pub error: Option<String>,
}
impl PhoneConnection {
    pub fn new(path: PathBuf, manager: Arc<PtyManager>) -> Mutex<Self> {
        let saved: Value = std::fs::read(path.join("connection.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or(Value::Null);
        let mut state = Self {
            host: None,
            path,
            enabled: saved["enabled"].as_bool() == Some(true),
            address: String::new(),
            error: None,
        };
        // A saved address from an older build is deliberately ignored: it goes
        // stale the moment this Mac joins another network.
        if state.enabled {
            state.error = state.start(manager).err();
        }
        Mutex::new(state)
    }
    pub fn enable(&mut self, manager: Arc<PtyManager>) -> Result<(), String> {
        self.enabled = true;
        save(&self.path, true)?;
        if self.host.is_some() {
            return Ok(());
        }
        let started = self.start(manager);
        self.error = started.clone().err();
        started
    }
    pub fn disable(&mut self) -> Result<(), String> {
        // Stop network access even if writing the preference fails.
        self.enabled = false;
        self.host = None;
        self.address = String::new();
        self.error = None;
        save(&self.path, false)
    }
    /// Keeps the listener on this Mac's current address: it starts a connection
    /// that could not bind earlier and rebinds after a Wi-Fi or VPN change, so
    /// the phone keeps finding the Mac without anyone opening Settings.
    pub fn refresh(&mut self, manager: Arc<PtyManager>) {
        if !self.enabled {
            return;
        }
        let current = default_address();
        if self.host.is_some() && (current.is_empty() || current == self.address) {
            return;
        }
        self.host = None;
        self.address = String::new();
        self.error = self.start(manager).err();
    }
    fn start(&mut self, manager: Arc<PtyManager>) -> Result<(), String> {
        let detected = default_address();
        if detected.is_empty() {
            return Err(NO_NETWORK.into());
        }
        let address = connection_address(&detected)?;
        let host = EmbeddedHost::start(
            self.path.clone(),
            SocketAddr::from((address, 4319)),
            Arc::new(DesktopBackend::new(manager)?),
            &computer_name(),
        )?;
        self.address = address.to_string();
        self.host = Some(host);
        Ok(())
    }
    pub fn status(&self) -> Value {
        let mut status = self
            .host
            .as_ref()
            .map(EmbeddedHost::status)
            .unwrap_or_else(|| json!({"devices":[],"pending":[],"active":[]}));
        status["enabled"] = json!(self.enabled);
        status["discoverable"] = json!(self.host.is_some());
        status["address"] = json!(self.address);
        status["error"] = json!(self.error);
        status
    }
    pub fn address(&self) -> &str {
        &self.address
    }
    pub fn host(&self) -> Result<&EmbeddedHost, String> {
        self.host.as_ref().ok_or_else(|| {
            self.error
                .clone()
                .unwrap_or_else(|| "Turn the iPhone connection on first".into())
        })
    }
}
fn save(path: &Path, enabled: bool) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    let temporary = path.join("connection.pending");
    std::fs::write(&temporary, json!({ "enabled": enabled }).to_string())
        .map_err(|e| e.to_string())?;
    std::fs::rename(temporary, path.join("connection.json")).map_err(|e| e.to_string())
}
