mod auth;
mod backend;
mod connection;
mod device_trust;
mod direct;
mod discovery;
mod discovery_watch;
mod embedded;
mod embedded_api;
mod embedded_runtime;
mod identity;
mod identity_contents;
mod identity_permissions;
mod identity_policy;
mod identity_store;
mod instance;
mod invitation;
mod lan_authorization;
pub mod notifications;
mod peer_policy;
mod presence;
mod preview_connection;
mod preview_upgrade;
mod registration_proof;
mod relay;
mod relay_address;
mod relay_connection;
mod relay_peers;
mod relay_writer;
mod remote_authorization;
mod remote_permissions;
mod remote_restrictions;
mod remote_revocation;
#[cfg(test)]
mod remote_test_support;
mod restriction_apply;
mod restriction_checkpoint;
mod state;

pub use backend::{Backend, PreviewAccess, PreviewHandler};
pub use embedded::EmbeddedHost;
pub use identity_store::IdentityKeyStore;
pub use preview_upgrade::{UpgradeRequest, UpgradeResponse};
pub use registration_proof::RegistrationProof;
pub use relay::{CredentialSource, RelayCredentials, RelayHandle, RelayStatus};
pub use remote_authorization::AuthorizationContext;
pub use remote_restrictions::{RestrictionBatch, RestrictionPage, RestrictionReceipt};
pub use restriction_checkpoint::RestrictionCheckpoint;
pub use vibyra_transport::preview::{
    Frame as PreviewFrame, ReceiveWindow, SendWindow, StreamKey, MAX_CHUNK, SEND_WINDOW_BYTES,
    WINDOW_BYTES,
};
/// The most one reply or event may hold. A backend must keep what it sends
/// under this: an event that does not fit ends the phone's connection.
pub use vibyra_transport::MAX_PLAINTEXT;

/// Stable computer identity without starting the phone listener. Agent Computer
/// uses the same registered identity even when phone access is switched off.
pub fn host_identity_id(directory: &std::path::Path) -> Result<String, String> {
    identity::Identity::load(directory, None).map(|identity| identity.id())
}
pub fn host_identity_id_with_key_store(
    directory: &std::path::Path,
    store: &dyn IdentityKeyStore,
) -> Result<String, String> {
    identity::Identity::load_with_store(directory, None, Some(store)).map(|identity| identity.id())
}
/// Public identity lookup never unlocks or creates an installation key.
pub fn saved_identity_id(directory: &std::path::Path) -> Result<Option<String>, String> {
    identity_policy::saved_id(directory)
}
/// Remove local trust while a Host is stopped, without unlocking its private key.
pub fn revoke_saved_devices(
    directory: &std::path::Path,
    device: Option<&str>,
) -> Result<(), String> {
    identity::Identity::revoke_devices(directory, device)
}
/// Reset a stopped Host at logout without creating an installation identity.
pub fn reset_lan_approval(directory: &std::path::Path) -> Result<(), String> {
    identity::Identity::reset_lan_approval(directory)
}

#[cfg(test)]
mod embedded_rebind_tests;
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

#[cfg(test)]
mod restriction_page_tests;
#[cfg(test)]
mod restriction_tests;

#[cfg(test)]
mod restriction_live_tests;

#[cfg(test)]
mod restriction_persistence_tests;
