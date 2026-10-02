//! Login/restore completions are bound to a local attempt, including cancellation.
use super::{AccountProfile, AccountSessionManager, AccountStatus, SecretStore};
impl AccountSessionManager {
    pub(crate) fn begin_attempt(&self, provider: Option<String>, prepare: impl FnOnce()) -> u64 {
        let mut state = self.inner.lock();
        self.oauth_cancel.cancel();
        state.epoch += 1;
        state.status = AccountStatus::Authorizing;
        state.error = None;
        state.pending_provider = provider;
        state.two_factor_challenge = None;
        prepare();
        state.epoch
    }
    pub(crate) fn begin_oauth_attempt(
        &self,
        provider: String,
        prepare: impl FnOnce(),
    ) -> (u64, super::Arc<super::AtomicBool>) {
        let mut state = self.inner.lock();
        state.epoch += 1;
        state.status = AccountStatus::Authorizing;
        state.error = None;
        state.pending_provider = Some(provider);
        state.two_factor_challenge = None;
        prepare();
        (state.epoch, self.oauth_cancel.begin())
    }
    pub(crate) fn with_attempt<T>(&self, epoch: u64, action: impl FnOnce() -> T) -> Option<T> {
        let state = self.inner.lock();
        if state.epoch != epoch {
            return None;
        }
        Some(action())
    }
    pub(crate) fn begin_restore(&self, prepare: impl FnOnce()) -> Option<u64> {
        let mut state = self.inner.lock();
        if state.token.is_some()
            || !matches!(
                state.status,
                AccountStatus::Restoring | AccountStatus::ConnectionError
            )
        {
            return None;
        }
        state.epoch += 1;
        state.status = AccountStatus::Restoring;
        prepare();
        Some(state.epoch)
    }
    pub(crate) fn begin_code_attempt(&self) -> Option<(u64, String)> {
        let mut state = self.inner.lock();
        if state.status != AccountStatus::TwoFactor {
            return None;
        }
        let challenge = state.two_factor_challenge.clone()?;
        state.epoch += 1;
        Some((state.epoch, challenge))
    }
    pub(crate) fn attempt_current(&self, epoch: u64) -> bool {
        self.inner.lock().epoch == epoch
    }
    pub(crate) fn status_for_attempt(
        &self,
        epoch: u64,
        status: AccountStatus,
        error: Option<String>,
    ) -> bool {
        let mut state = self.inner.lock();
        if state.epoch != epoch {
            return false;
        }
        state.status = status;
        state.error = error;
        if status != AccountStatus::Authorizing {
            state.pending_provider = None;
        }
        true
    }
    pub(crate) fn challenge_for_attempt(&self, epoch: u64, challenge: String) {
        let mut state = self.inner.lock();
        if state.epoch != epoch {
            return;
        }
        state.status = AccountStatus::TwoFactor;
        state.error = None;
        state.pending_provider = None;
        state.two_factor_challenge = Some(challenge);
    }
    pub(crate) fn adopt_for_attempt(
        &self,
        epoch: u64,
        token: String,
        profile: AccountProfile,
        bind: impl FnOnce(),
    ) -> bool {
        self.adopt_attempt_with(epoch, token, profile, bind, |token| {
            SecretStore.write_account_session(Some(token)).is_ok()
        })
    }
    fn adopt_attempt_with(
        &self,
        epoch: u64,
        token: String,
        profile: AccountProfile,
        bind: impl FnOnce(),
        persist: impl FnOnce(&str) -> bool,
    ) -> bool {
        let mut state = self.inner.lock();
        if state.epoch != epoch {
            return false;
        }
        state.secure_storage = persist(&token);
        bind();
        state.epoch += 1;
        state.token = Some(token);
        state.profile = Some(profile);
        state.status = AccountStatus::SignedIn;
        state.error = None;
        state.pending_provider = None;
        state.two_factor_challenge = None;
        true
    }
    pub(crate) fn replace_for_token(&self, old: &str, fresh: String) -> bool {
        self.replace_with(old, fresh, |token| {
            SecretStore.write_account_session(Some(token)).is_ok()
        })
    }
    fn replace_with(&self, old: &str, fresh: String, persist: impl FnOnce(&str) -> bool) -> bool {
        let mut state = self.inner.lock();
        if state.token.as_deref() != Some(old) {
            return false;
        }
        if !persist(&fresh) {
            state.secure_storage = false;
        }
        state.token = Some(fresh);
        state.epoch += 1;
        true
    }
    pub(crate) fn logout_local(&self, cleanup: impl FnOnce()) -> Option<String> {
        let mut state = self.inner.lock();
        self.oauth_cancel.cancel();
        state.epoch += 1;
        cleanup();
        let token = state.token.take();
        state.profile = None;
        state.status = AccountStatus::SignedOut;
        state.error = None;
        state.pending_provider = None;
        state.two_factor_challenge = None;
        if SecretStore.write_account_session(None).is_err() {
            state.secure_storage = false;
        }
        token
    }
    pub(crate) fn storage_failed_for_attempt(&self, epoch: u64) {
        let mut state = self.inner.lock();
        if state.epoch == epoch {
            state.secure_storage = false;
        }
    }
    pub(crate) fn reject_attempt(&self, epoch: u64, cleanup: impl FnOnce()) -> bool {
        let mut state = self.inner.lock();
        if state.epoch != epoch {
            return false;
        }
        cleanup();
        state.epoch += 1;
        state.token = None;
        state.profile = None;
        state.status = AccountStatus::SignedOut;
        state.error = None;
        state.pending_provider = None;
        state.two_factor_challenge = None;
        if SecretStore.write_account_session(None).is_err() {
            state.secure_storage = false;
        }
        true
    }
}
#[cfg(test)]
#[path = "account_session_attempt_tests.rs"]
mod tests;
