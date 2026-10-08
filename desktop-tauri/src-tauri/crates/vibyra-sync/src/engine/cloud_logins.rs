//! Logins made only for Vibyra Cloud (contract: "Logins", 2026-10-07). The person clicked Allow on this Mac, the
//! provider's own CLI wrote a brand-new login into a private folder, and that artifact is sealed to the cloud key
//! and uploaded with `origin=cloud`. It is never the Mac's own login, so Cloud and the Mac never sign each other
//! out. Nothing here logs or returns the contents.
use super::{now, Engine};
use crate::client::{AccountState, CloudLogin};
use crate::crypto::{hex, seal_bytes, unhex};
use crate::error::{Result, SyncError};
use crate::logins::{LoginOutcome, ProviderState};
use sha2::{Digest, Sha256};

/// Whether Vibyra Cloud already has (or is receiving) a login made for it for `provider`.
pub fn has_cloud_login(login: &CloudLogin) -> bool {
    login.origin.as_deref() == Some("cloud")
        && (login.pending || login.applied_seq >= login.seq && login.seq > 0)
}

impl Engine {
    /// Seals `artifact` (the one-entry tar for `provider`) to the cloud key and uploads it as Cloud's own login.
    /// `WaitingForCloud` until the cloud computer has published its key (it has never started yet).
    pub fn send_cloud_login(&self, provider: &str, artifact: &[u8]) -> Result<LoginOutcome> {
        if provider != "codex" && provider != "claude" {
            return Err(SyncError::Invalid(
                "That login cannot go to Vibyra Cloud.".into(),
            ));
        }
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut account = self.client.account_state(&self.keys.device_id)?;
        let local = self.logins.provider(provider);
        let mut last = SyncError::Invalid("The login upload did not run.".into());
        for _ in 0..3 {
            let Some(key_hex) = account.vm_key.clone() else {
                return Ok(LoginOutcome::WaitingForCloud);
            };
            let Some(vm_key) = unhex::<32>(&key_hex) else {
                return Ok(LoginOutcome::WaitingForCloud);
            };
            let sealed = seal_bytes(&vm_key, artifact)?;
            let sealed_sha = hex(&Sha256::digest(&sealed));

            let seq = local.seq.max(account.logins.get(provider).seq) + 1;
            match self
                .client
                .put_cloud_login(provider, seq, &sealed_sha, &sealed, &key_hex)
            {
                Ok(()) => {
                    // No content hash: a Cloud login is sent once, never compared with a file on this Mac.
                    self.logins.save(
                        provider,
                        &ProviderState {
                            seq,
                            sent_sha: None,
                            sent_at: Some(now()),
                            sent_key: Some(key_hex),
                        },
                    )?;
                    return Ok(LoginOutcome::Sent {
                        seq,
                        bytes: sealed.len() as u64,
                    });
                }
                Err(e) if matches!(e.code(), Some("seq_conflict" | "vm_key_changed")) => {
                    account = self.client.account_state(&self.keys.device_id)?;
                    if account.vm_key.as_deref().and_then(unhex::<32>).is_none() {
                        return Ok(LoginOutcome::WaitingForCloud);
                    }
                    last = e;
                }
                Err(e) => return Err(e),
            }
        }
        Err(last)
    }

    /// What the cloud says about `provider`'s login (one request).
    pub fn cloud_login(&self, provider: &str) -> Result<(CloudLogin, bool)> {
        let account: AccountState = self.client.account_state(&self.keys.device_id)?;
        Ok((
            account.logins.get(provider).clone(),
            account.vm_key.as_deref().and_then(unhex::<32>).is_some(),
        ))
    }
}
