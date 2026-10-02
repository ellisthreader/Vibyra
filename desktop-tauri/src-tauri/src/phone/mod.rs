mod access;
pub mod address;
mod ai_accounts;
#[cfg(test)]
mod ai_accounts_tests;
mod notifications;
mod preferences;
mod remote;
#[cfg(test)]
mod remote_lifecycle_tests;
pub(crate) mod remote_registration;
mod remote_revocation;
pub(crate) mod remote_transfer_scope;
// Prepared Mac-side permission boundary. Deliberately disconnected from RPC.
pub(crate) mod backend;
mod connection_init;
mod connection_lifecycle;
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
mod manage_permission_tests;
#[cfg(test)]
mod manage_tests;
#[cfg(test)]
mod preview_attached_fixture;
#[cfg(test)]
mod preview_attached_tests;
#[cfg(test)]
mod preview_auto_tests;
#[allow(dead_code)]
pub(crate) mod preview_grants;
#[cfg(test)]
mod preview_grants_account_tests;
#[cfg(test)]
mod preview_grants_tests;
#[cfg(all(test, unix))]
mod preview_live_fixture_tests;
#[cfg(test)]
mod preview_noise_tests;
mod preview_service;
#[cfg(test)]
mod preview_service_fixture_support;
#[cfg(test)]
mod preview_service_fixture_tests;
#[cfg(test)]
mod preview_service_tests;
#[cfg(test)]
mod preview_upgrade_handshake;
#[cfg(test)]
mod preview_upgrade_tests;
#[cfg(all(test, target_os = "macos"))]
mod preview_window_live;
#[cfg(all(test, target_os = "macos"))]
mod preview_window_tests;
mod railway;
mod railway_resources;
mod railway_tools;
pub mod requests;
pub(crate) mod scaffold;
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
#[cfg(test)]
use parking_lot::Mutex;
use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
};
#[cfg(test)]
use vibyra_core::pty::PtyManager;
use vibyra_host::{EmbeddedHost, RelayHandle};
pub use watch::{notify_window, watch};
use workspace::SharedWorkspace;

pub const NO_NETWORK: &str = crate::platform_text::for_computer(
    "Connect this Mac to Wi-Fi or a private VPN. Vibyra will find the address itself.",
    "Connect this computer to Wi-Fi or a private VPN. Vibyra will find the address itself.",
);

/// The iPhone connection is one switch. `enabled` is what the person asked for
/// and survives restarts; the listener address is detected, never typed, and is
/// re-detected whenever this Mac changes network.
pub struct PhoneConnection {
    chats: Option<Arc<crate::shared_chats::SharedChats>>,
    pub host: Option<EmbeddedHost>,
    path: PathBuf,
    enabled: bool,
    address: String,
    pending_address: Option<String>,
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
    notifications: Option<vibyra_host::notifications::NotificationHandle>,
    account: Option<Arc<AccountSessionManager>>,
    pub error: Option<String>,
    pub vault: Arc<vault::Vault>,
    /// Terminals a phone asked the window to start or close, awaiting it.
    pub requests: Arc<requests::TerminalRequests>,
    provider_auth: Option<Arc<crate::provider_auth::ProviderAuthManager>>,
    preview_service: Option<Arc<preview_service::PreviewService>>,
}
impl PhoneConnection {
    #[cfg(test)]
    pub fn new(path: PathBuf, manager: Arc<PtyManager>) -> Mutex<Self> {
        Self::with_chats(path, manager, None, None)
    }
}

pub(crate) mod saved;
#[cfg(test)]
mod saved_tests;
