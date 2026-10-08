//! Remote access: the outbound leg from this Mac to Vibyra Cloud, so the phones
//! on the same Vibyra account reach these terminals from any network. The
//! relay only ever sees Noise-encrypted frames; the account API only ever
//! sees that this Mac exists and which phone connected when.
use super::{preferences::computer_name, preferences::save, PhoneConnection};
use crate::account_session::AccountSessionManager;
use std::sync::Arc;
use vibyra_host::{CredentialSource, RegistrationProof};

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
    proof: RegistrationProof,
) -> CredentialSource {
    Arc::new(move || {
        let account = account.clone();
        let host_id = host_id.clone();
        let name = name.clone();
        let proof = proof.clone();
        Box::pin(async move {
            let Some(token) = account.token() else {
                return Err(SIGNED_OUT.into());
            };
            super::remote_registration::register(
                &account,
                &token,
                &host_id,
                name,
                &proof,
                super::remote_registration::Action::Register,
                &|| Ok(()),
            )
            .await
        })
    })
}

impl PhoneConnection {
    pub fn cloud_identity(&mut self) -> Result<(String, RegistrationProof), String> {
        let host = self.host()?;
        let identity = (host.id(), host.registration_proof());
        if !self.remote_enabled {
            self.set_remote(true)?;
        }
        Ok(identity)
    }

    pub fn remote_transfer_identity(&self) -> Result<(String, String, RegistrationProof), String> {
        let host = self.host()?;
        if !self.remote_enabled {
            return Err("Enable Vibyra Cloud before moving this computer.".into());
        }
        Ok((host.id(), computer_name(), host.registration_proof()))
    }

    /// A signed-out Mac must not keep a relay socket registered to its former
    /// account. Keep the person's Remote access preference for the next login.
    pub fn account_signed_out(&mut self) {
        self.remote = None;
        self.reset_nearby_approval();
    }

    /// A newly verified session must register a fresh relay socket under that
    /// account, even when an earlier account's leg was still connected.
    pub fn account_signed_in(&mut self) {
        self.remote = None;
        self.reset_nearby_approval();
        if self.remote_enabled {
            self.start_remote();
        }
    }

    fn reset_nearby_approval(&mut self) {
        let result = match &self.host {
            Some(host) => host.request_lan_reapproval(),
            None => vibyra_host::reset_lan_approval(&self.path),
        };
        if let Err(error) = result {
            self.error = Some(error);
        }
    }

    /// Remote access on or off. On, the cloud leg starts as soon as the
    /// connection is up (and waits, signed out, rather than failing); off
    /// drops every phone that came through the cloud at once.
    pub fn set_remote(&mut self, on: bool) -> Result<(), String> {
        if !on {
            self.remote = None;
            self.remote_enabled = false;
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
        host.require_restriction_sync();
        let source = credentials(
            account.clone(),
            host.id(),
            computer_name(),
            host.registration_proof(),
        );
        self.remote = Some(host.relay(source));
    }
}
