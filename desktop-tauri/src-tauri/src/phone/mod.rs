mod access;
pub mod address;
mod preferences;
mod remote;
use preferences::save;
mod backend;
mod control;
#[cfg(test)]
mod control_tests;
mod frames;
#[cfg(test)]
mod frames_tests;
mod manage;
#[cfg(all(test, unix))]
mod manage_chat_tests;
#[cfg(test)]
mod manage_tests;
mod railway;
mod railway_resources;
mod railway_tools;
pub mod requests;
mod scaffold;
#[cfg(test)]
mod scaffold_tests;
pub(crate) mod shared_backend;
mod stream;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod typing_tests;
pub mod vault;
#[cfg(test)]
mod vault_backend_tests;
mod watch;
pub mod workspace;
#[cfg(test)]
mod workspace_tests;

use crate::account_session::AccountSessionManager;
use address::{connection_address, default_address};
use backend::DesktopBackend;
use parking_lot::Mutex;
use serde_json::Value;
use std::{
    net::SocketAddr,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
};
use vibyra_core::pty::PtyManager;
use vibyra_host::{EmbeddedHost, RelayHandle};
pub use watch::{notify_window, watch};
use workspace::SharedWorkspace;

use preferences::computer_name;

pub const NO_NETWORK: &str =
    "Connect this Mac to Wi-Fi or a private VPN. Vibyra will find the address itself.";

/// The iPhone connection is one switch. `enabled` is what the person asked for
/// and survives restarts; the listener address is detected, never typed, and is
/// re-detected whenever this Mac changes network.
pub struct PhoneConnection {
    chats: Option<Arc<crate::shared_chats::SharedChats>>,
    pub host: Option<EmbeddedHost>,
    path: PathBuf,
    enabled: bool,
    address: String,
    /// The desktop's own projects and panes. Kept on the connection rather
    /// than the listener so it survives the connection being switched off, a
    /// network change or a rebind, and is already right when a phone arrives.
    workspace: SharedWorkspace,
    /// Whether an allowed phone may type into terminals, not just watch them.
    /// Its own switch, off until turned on here: every phone allowed before it
    /// existed was allowed under a prompt promising it could not type.
    typing: Arc<AtomicBool>,
    /// Remote access: reach this Mac through Vibyra Cloud from any network.
    /// Its own switch under the connection, off by default; it needs the Mac
    /// signed in to a Vibyra account, and only that account's phones get in.
    remote_enabled: bool,
    remote: Option<RelayHandle>,
    account: Option<Arc<AccountSessionManager>>,
    pub error: Option<String>,
    /// The one folder, if any, this Mac reads out to its phone. Independent of
    /// `chats`: a vault has no account and no conversation, only a folder.
    pub vault: Arc<vault::Vault>,
    /// Terminals a phone asked the window to start or close, awaiting it.
    pub requests: Arc<requests::TerminalRequests>,
}
impl PhoneConnection {
    #[cfg(test)]
    pub fn new(path: PathBuf, manager: Arc<PtyManager>) -> Mutex<Self> {
        Self::with_chats(path, manager, None, None)
    }
    pub fn with_chats(
        path: PathBuf,
        manager: Arc<PtyManager>,
        chats: Option<Arc<crate::shared_chats::SharedChats>>,
        account: Option<Arc<AccountSessionManager>>,
    ) -> Mutex<Self> {
        let saved: Value = std::fs::read(path.join("connection.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or(Value::Null);
        let mut state = Self {
            chats,
            host: None,
            vault: vault::Vault::new(path.join("phone")),
            path,
            enabled: saved["enabled"].as_bool() == Some(true),
            address: String::new(),
            workspace: SharedWorkspace::default(),
            typing: Arc::new(AtomicBool::new(saved["typing"].as_bool() == Some(true))),
            remote_enabled: saved["remote"].as_bool() == Some(true),
            remote: None,
            account,
            error: None,
            requests: Arc::default(),
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
        save(&self.path, true, self.typing(), self.remote_enabled)?;
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
        self.remote = None;
        self.host = None;
        self.address = String::new();
        self.error = None;
        save(&self.path, false, self.typing(), self.remote_enabled)
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
        self.remote = None;
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
        let terminal = DesktopBackend::new(
            manager,
            self.workspace.clone(),
            self.typing.clone(),
            self.vault.clone(),
            self.requests.clone(),
        )?;
        let backend: Arc<dyn vibyra_host::Backend> = match &self.chats {
            Some(chats) => Arc::new(shared_backend::SharedBackend {
                terminal,
                chats: chats.clone(),
                typing: self.typing.clone(),
            }),
            None => Arc::new(terminal),
        };
        let host = EmbeddedHost::start(
            self.path.clone(),
            SocketAddr::from((address, 4319)),
            backend,
            &computer_name(),
        )?;
        self.address = address.to_string();
        self.host = Some(host);
        if self.remote_enabled {
            self.start_remote();
        }
        Ok(())
    }
}
