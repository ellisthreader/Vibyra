//! What the window reads from the iPhone connection and what it publishes to
//! it: status for Settings and the approval prompt, the workspace the phone is
//! served, and the running host for invitations, answers and revocation.
use super::PhoneConnection;
use serde_json::{json, Value};
use vibyra_host::{EmbeddedHost, RelayHandle};

use super::workspace::{DesktopPane, DesktopProject};
use std::path::PathBuf;

impl PhoneConnection {
    /// Capture account state before taking the PhoneConnection mutex.
    pub fn status(&self, signed_in: bool) -> Value {
        let mut status = self
            .host
            .as_ref()
            .map(EmbeddedHost::status)
            .unwrap_or_else(|| json!({"devices":[],"pending":[],"active":[]}));
        status["enabled"] = json!(self.enabled);
        status["notifications"] = json!(self.notifications.is_some());
        status["typing"] = json!(self.typing());
        status["remote"] = json!({
            "enabled": self.remote_enabled,
            "signedIn": signed_in,
            "leg": self.remote.as_ref().map(RelayHandle::status),
        });
        if self.host.is_none() {
            status["discoverable"] = json!(false);
            status["listening"] = json!(false);
        }
        status["address"] = json!(self.address);
        status["error"] = json!(self.error);
        status["vault"] = json!({"path": self.vault.path()});
        status["previewAutoAvailable"] = json!(self.preview_service.is_some());
        if let (Some(preview), Some(devices)) =
            (&self.preview_service, status["devices"].as_array_mut())
        {
            for device in devices {
                if let Some(id) = device["id"].as_str() {
                    device["previewAuto"] = json!(preview.automatic_allowed(id));
                }
            }
        }
        status
    }
    /// The window says what it is showing; the phone is then served the same
    /// folders under the same names. Accepted whether or not the connection is
    /// on, so turning it on serves the real workspace from the first request.
    pub fn publish(
        &self,
        projects: Vec<DesktopProject>,
        panes: Vec<DesktopPane>,
        chats: Option<Vec<String>>,
    ) {
        self.workspace.write().publish(projects, panes, chats);
    }
    pub fn publish_saved(&self, saved: Vec<super::saved::SavedPane>) {
        self.workspace.write().saved = saved
            .into_iter()
            .filter(|pane| pane.id < 0)
            .take(128)
            .collect();
    }
    #[cfg(test)]
    pub(crate) fn enable_test_terminal_effects(&mut self) {
        self.enabled = true;
        self.typing.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    pub fn allows_terminal_effect(&self) -> bool {
        self.enabled && self.typing()
    }
    pub fn saved_terminal(&self, id: i64, project: &str) -> Option<(String, String)> {
        self.workspace
            .read()
            .saved
            .iter()
            .find(|p| p.id == id && p.project_id == project)
            .map(|p| (p.kind.clone(), p.title.clone()))
    }
    pub fn address(&self) -> &str {
        &self.address
    }
    pub fn project_terminal_ids(&self, id: &str) -> Vec<u64> {
        self.workspace.read().project_terminal_ids(id)
    }
    pub fn project_root(&self, id: &str) -> Option<PathBuf> {
        self.workspace.read().project_root(id)
    }
    pub fn host(&self) -> Result<&EmbeddedHost, String> {
        self.host.as_ref().ok_or_else(|| {
            self.error
                .clone()
                .unwrap_or_else(|| "Turn the iPhone connection on first".into())
        })
    }
}
