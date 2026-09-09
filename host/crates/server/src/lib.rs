mod auth;
mod backend;
mod connection;
mod direct;
mod discovery;
mod embedded;
mod identity;
mod instance;
mod invitation;
mod peer_policy;
mod state;

pub use backend::Backend;
pub use embedded::EmbeddedHost;

#[cfg(test)]
mod embedded_tests;
