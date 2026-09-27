//! Remote access: the outbound leg from this Mac to Vibyra Cloud, so the phones
//! on the same Vibyra account reach these terminals from any network. The
//! relay only ever sees Noise-encrypted frames; the account API only ever
//! sees that this Mac exists and which phone connected when.
use super::{preferences::computer_name, preferences::save, PhoneConnection};
use crate::account_api::{request, ApiError, Endpoint};
use crate::account_session::AccountSessionManager;
use serde_json::json;
use std::sync::Arc;
use vibyra_host::{CredentialSource, RelayCredentials};

pub const SIGNED_OUT: &str = crate::platform_text::for_computer(
    "Sign in to Vibyra on this Mac to reach it from anywhere.",
    "Sign in to Vibyra on this computer to reach it from anywhere.",
);

/// Fetches a fresh relay registration from the account API before every relay
/// connection. Registering is what tells the account this Mac exists, so a
/// phone can list it; the token it returns is what the relay admits it on.
pub fn credentials(
    account: Arc<AccountSessionManager>,
    host_id: String,
    name: String,
) -> CredentialSource {
    Arc::new(move || {
        let account = account.clone();
        let host_id = host_id.clone();
        let name = name.clone();
        Box::pin(async move {
            let Some(token) = account.token() else {
                return Err(SIGNED_OUT.into());
            };
            let body = json!({"hostId": host_id, "name": name, "platform": std::env::consts::OS,
                "version": env!("CARGO_PKG_VERSION")});
            let reply = request(Endpoint::RemoteRegister, Some(&token), Some(body))
                .await
                .map_err(|error| match error {
                    ApiError::Unauthorized(_) => SIGNED_OUT.to_string(),
                    other => other.message().to_string(),
                })?;
            let url = reply["relayUrl"].as_str().unwrap_or_default().to_string();
            let token = reply["token"].as_str().unwrap_or_default().to_string();
            if !url.starts_with("wss://") && !url.starts_with("ws://127.0.0.1") {
                return Err("Vibyra Cloud did not offer a secure relay address.".into());
            }
            if token.len() < 32 {
                return Err("Vibyra Cloud did not issue a relay token.".into());
            }
            Ok(RelayCredentials { url, token, name })
        })
    })
}

impl PhoneConnection {
    /// Remote access on or off. On, the cloud leg starts as soon as the
    /// connection is up (and waits, signed out, rather than failing); off
    /// drops every phone that came through the cloud at once.
    pub fn set_remote(&mut self, on: bool) -> Result<(), String> {
        if !on {
            self.remote = None;
        }
        save(&self.path, self.enabled, self.typing(), on)?;
        self.remote_enabled = on;
        if on && self.remote.is_none() {
            self.start_remote();
        }
        Ok(())
    }
    /// The emergency action: ends every session that came through the cloud.
    /// This Mac stays registered, so a phone can come back deliberately.
    pub fn remote_disconnect_all(&self) {
        if let Some(remote) = &self.remote {
            remote.disconnect_all();
        }
    }
    pub(super) fn start_remote(&mut self) {
        let (Some(host), Some(account)) = (&self.host, &self.account) else {
            return;
        };
        let source = credentials(account.clone(), host.id(), computer_name());
        self.remote = Some(host.relay(source));
    }
}
