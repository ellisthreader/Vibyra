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
mod relay;
mod relay_peers;
mod state;

pub use backend::Backend;
pub use embedded::EmbeddedHost;
pub use relay::{CredentialSource, RelayCredentials, RelayHandle, RelayStatus};
/// The most one reply or event may hold. A backend must keep what it sends
/// under this: an event that does not fit ends the phone's connection.
pub use vibyra_transport::MAX_PLAINTEXT;

#[cfg(test)]
mod embedded_tests;
#[cfg(test)]
mod relay_test_support;
#[cfg(test)]
mod relay_tests;
#[cfg(test)]
mod relay_wait_tests;

#[cfg(test)]
mod notifications_audit_tests;
