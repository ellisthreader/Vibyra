use super::PhoneConnection;
use serde_json::json;
use std::{path::Path, sync::atomic::Ordering};

pub(super) fn save(path: &Path, enabled: bool, typing: bool, remote: bool) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    let temporary = path.join("connection.pending");
    let preference = json!({ "enabled": enabled, "typing": typing, "remote": remote });
    std::fs::write(&temporary, preference.to_string()).map_err(|e| e.to_string())?;
    std::fs::rename(temporary, path.join("connection.json")).map_err(|e| e.to_string())
}

pub(super) fn computer_name() -> String {
    crate::account_device::hostname()
        .map(|name| name.trim_end_matches(".local").to_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Vibyra Desktop".into())
}

impl PhoneConnection {
    pub(super) fn typing(&self) -> bool {
        self.typing.load(Ordering::SeqCst)
    }
    /// Takes effect on the next claim or keystroke, and connected phones are
    /// told to refetch, so their box appears or goes without reconnecting.
    pub fn set_typing(&mut self, on: bool) -> Result<(), String> {
        // Turning it off holds even if the preference cannot be written;
        // turning it on waits until it can, so a restart never widens it.
        if !on {
            self.typing.store(false, Ordering::SeqCst);
        }
        save(&self.path, self.enabled, on, self.remote_enabled)?;
        self.typing.store(on, Ordering::SeqCst);
        Ok(())
    }
}
