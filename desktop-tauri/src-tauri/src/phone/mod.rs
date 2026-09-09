pub mod address;
mod backend;
#[cfg(test)]
mod tests;

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

pub struct PhoneConnection {
    pub host: Option<EmbeddedHost>,
    path: PathBuf,
    pub address: String,
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
            address: saved["address"]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(default_address),
            error: None,
        };
        if saved["enabled"].as_bool() == Some(true) {
            if let Err(error) = state.enable(&state.address.clone(), manager) {
                state.error = Some(error);
            }
        }
        Mutex::new(state)
    }
    pub fn enable(&mut self, address: &str, manager: Arc<PtyManager>) -> Result<(), String> {
        if self.host.is_some() {
            return Err("Phone connection is already enabled".into());
        }
        let address = connection_address(address)?;
        let host = EmbeddedHost::start(
            self.path.clone(),
            SocketAddr::from((address, 4319)),
            Arc::new(DesktopBackend::new(manager)?),
        )?;
        save(&self.path, true, &address.to_string())?;
        self.address = address.to_string();
        self.host = Some(host);
        self.error = None;
        Ok(())
    }
    pub fn disable(&mut self) -> Result<(), String> {
        // Stop network access even if writing the preference fails.
        self.host = None;
        save(&self.path, false, &self.address)?;
        self.error = None;
        Ok(())
    }
    pub fn status(&self) -> Value {
        let mut status = self
            .host
            .as_ref()
            .map(EmbeddedHost::status)
            .unwrap_or_else(|| json!({"enabled":false,"devices":[],"pending":[],"active":[]}));
        status["address"] = json!(self.address);
        status["error"] = json!(self.error);
        status
    }
    pub fn host(&self) -> Result<&EmbeddedHost, String> {
        self.host
            .as_ref()
            .ok_or("Enable the phone connection first".into())
    }
}
fn save(path: &Path, enabled: bool, address: &str) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    let temporary = path.join("connection.pending");
    std::fs::write(
        &temporary,
        json!({"enabled":enabled,"address":address}).to_string(),
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temporary, path.join("connection.json")).map_err(|e| e.to_string())
}
