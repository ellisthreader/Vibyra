//! Carry a Codex login to the cloud computer (opt-in; contract: "Logins"). One file, sealed to the cloud key,
//! uploaded with a seq that only grows. Nothing here logs or returns the contents.
use super::{now, Engine};
use crate::crypto::{hex, seal_bytes, unhex};
use crate::error::{Result, SyncError};
use crate::logins::{
    pack_codex, CodexSource, LoginOutcome, LoginStatus, ProviderState, RESEND_MIN_SECS,
};
use sha2::{Digest, Sha256};

impl Engine {
    /// Sends the Codex login in `source` unless the file has not changed since the last send.
    /// `force` (an explicit request: the first send, "Sync now", the CLI) skips the 10-minute spacing of
    /// changed files and also checks with the cloud that its copy is still there and sealed to its current key;
    /// without it an unchanged file costs one local read and no request.
    pub fn send_codex_login(&self, source: &CodexSource, force: bool) -> Result<LoginOutcome> {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let Some(contents) = source.read()? else {
            return Ok(LoginOutcome::NotSignedIn);
        };
        let sha = hex(&Sha256::digest(&contents));
        let mut st = self.logins.codex();
        let changed = st.sent_sha.as_deref() != Some(sha.as_str());
        if !changed && !force {
            return Ok(LoginOutcome::Unchanged);
        }
        if changed && !force {
            if let Some(at) = st.sent_at {
                let wait = (at + RESEND_MIN_SECS).saturating_sub(now());
                if wait > 0 {
                    return Ok(LoginOutcome::Throttled {
                        retry_in_secs: wait,
                    });
                }
            }
        }
        let mut account = self.client.account_state(&self.keys.device_id)?;
        let Some(key_hex) = account.vm_key.clone() else {
            return Ok(LoginOutcome::WaitingForCloud);
        };
        let Some(vm_key) = unhex::<32>(&key_hex) else {
            return Ok(LoginOutcome::WaitingForCloud);
        };
        if !changed
            && st.sent_key.as_deref() == Some(key_hex.as_str())
            && account.logins.codex.seq >= st.seq
        {
            return Ok(LoginOutcome::Unchanged);
        }
        let sealed = seal_bytes(&vm_key, &pack_codex(&contents)?)?;
        let sealed_sha = hex(&Sha256::digest(&sealed));
        let mut last = SyncError::Invalid("The login upload did not run.".into());
        for _ in 0..3 {
            let seq = st.seq.max(account.logins.codex.seq) + 1;
            match self
                .client
                .put_login("codex", seq, &sealed_sha, &sealed, None)
            {
                Ok(()) => {
                    st = ProviderState {
                        seq,
                        sent_sha: Some(sha),
                        sent_at: Some(now()),
                        sent_key: Some(key_hex),
                    };
                    self.logins.save_codex(&st)?;
                    return Ok(LoginOutcome::Sent {
                        seq,
                        bytes: sealed.len() as u64,
                    });
                }
                Err(e) if matches!(e.code(), Some("seq_conflict")) => {
                    account = self.client.account_state(&self.keys.device_id)?;
                    last = e;
                }
                Err(e) => return Err(e),
            }
        }
        Err(last)
    }

    /// "Stop using my Codex login in the cloud": `DELETE /login/codex`, then forgets what was sent (the seq is
    /// kept so a later send still counts up). A login already applied on the cloud computer stays there until
    /// the user signs out of Codex on it.
    pub fn remove_codex_login(&self) -> Result<()> {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let st = self.logins.codex();
        // Migrate only an identified local copy. Cloud-owned logins must survive,
        // including a replacement that races this read (server checks expectedSeq).
        if st.sent_sha.is_some() {
            let account = self.client.account_state(&self.keys.device_id)?;
            let current = &account.logins.codex;
            if current.origin.is_none() && current.seq > 0 {
                self.client.delete_login_copy("codex", current.seq)?;
            }
        }
        self.logins.save_codex(&ProviderState {
            seq: st.seq,
            ..ProviderState::default()
        })
    }

    /// Whether a Codex login from this Mac is in the cloud, and when it went up (local state, no request).
    pub fn codex_login_status(&self) -> LoginStatus {
        self.logins.status()
    }
}
