//! What the window reads from the iPhone connection and what it publishes to
//! it: status for Settings and the approval prompt, the workspace the phone is
//! served, and the running host for invitations, answers and revocation.
use super::PhoneConnection;
use serde_json::{json, Value};
use vibyra_host::{EmbeddedHost, RelayHandle};

use super::workspace::{DesktopPane, DesktopProject};

impl PhoneConnection {
    pub fn status(&self) -> Value {
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
            "signedIn": self.account.as_ref().is_some_and(|a| a.token().is_some()),
            "leg": self.remote.as_ref().map(RelayHandle::status),
        });
        if self.host.is_none() {
            status["discoverable"] = json!(false);
            status["listening"] = json!(false);
        }
        status["address"] = json!(self.address);
        status["error"] = json!(self.error);
        status["vault"] = json!({"path": self.vault.path()});
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
