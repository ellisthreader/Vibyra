mod auth;
mod backend;
mod connection;
mod direct;
mod discovery;
mod discovery_watch;
mod embedded;
mod embedded_api;
mod identity;
mod instance;
mod invitation;
pub mod notifications;
mod peer_policy;
mod presence;
mod preview_connection;
mod preview_upgrade;
mod relay;
mod relay_peers;
mod state;

pub use backend::{Backend, PreviewHandler};
pub use embedded::EmbeddedHost;
pub use preview_upgrade::{UpgradeRequest, UpgradeResponse};
pub use relay::{CredentialSource, RelayCredentials, RelayHandle, RelayStatus};
pub use vibyra_transport::preview::{
    Frame as PreviewFrame, ReceiveWindow, SendWindow, StreamKey, MAX_CHUNK, WINDOW_BYTES,
};
/// The most one reply or event may hold. A backend must keep what it sends
/// under this: an event that does not fit ends the phone's connection.
pub use vibyra_transport::MAX_PLAINTEXT;

/// Stable computer identity without starting the phone listener. Agent Computer
/// uses the same registered identity even when phone access is switched off.
pub fn host_identity_id(directory: &std::path::Path) -> Result<String, String> {
    identity::Identity::load(directory, None).map(|identity| identity.id())
}

#[cfg(test)]
mod embedded_tests;
#[cfg(test)]
mod relay_preview_tests;
#[cfg(test)]
mod relay_test_support;
#[cfg(test)]
mod relay_tests;
#[cfg(test)]
mod relay_wait_tests;

#[cfg(test)]
mod notifications_audit_tests;
