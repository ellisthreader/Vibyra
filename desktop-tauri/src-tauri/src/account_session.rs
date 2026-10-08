use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use parking_lot::Mutex;

use crate::account_cancel::CancelFlag;
use crate::account_types::{AccountProfile, AccountSnapshot, AccountStatus};
use crate::secret_store::SecretStore;

#[path = "account_session_attempt.rs"]
mod attempt;
#[path = "account_session_binding.rs"]
mod binding;
#[path = "account_session_license.rs"]
mod license;
#[path = "account_session_rejection.rs"]
mod rejection;
#[path = "account_session_welcome.rs"]
mod welcome;

struct SessionState {
    epoch: u64,
    status: AccountStatus,
    token: Option<String>,
    profile: Option<AccountProfile>,
    error: Option<String>,
    pending_provider: Option<String>,
    secure_storage: bool,
    /// The handle a correct password bought on a two-factor account. It is
    /// spent once, for one code, and never reaches the renderer.
    two_factor_challenge: Option<String>,
}

/// Owns the Vibyra account session: the in-memory bearer token, the coarse
/// renderer-facing status, and the OS credential entry. The token is only
/// readable through `token()` inside native code.
pub struct AccountSessionManager {
    inner: Mutex<SessionState>,
    oauth_cancel: CancelFlag,
    /// The provider re-sign-in whose only effect is deleting this account.
    pub delete_cancel: CancelFlag,
}

impl Default for AccountSessionManager {
    fn default() -> Self {
        Self {
            inner: Mutex::new(SessionState {
                epoch: 0,
                status: AccountStatus::Restoring,
                token: None,
                profile: None,
                error: None,
                pending_provider: None,
                secure_storage: true,
                two_factor_challenge: None,
            }),
            oauth_cancel: CancelFlag::default(),
            delete_cancel: CancelFlag::default(),
        }
    }
}

impl AccountSessionManager {
    pub fn snapshot(&self) -> AccountSnapshot {
        let state = self.inner.lock();
        AccountSnapshot {
            status: state.status.as_str(),
            profile: state.profile.clone(),
            error: state.error.clone(),
            pending_provider: state.pending_provider.clone(),
            secure_storage: state.secure_storage,
        }
    }

    pub fn token(&self) -> Option<String> {
        self.inner.lock().token.clone()
    }

    /// The limits native commands enforce. Without a verified profile the
    /// workspace is Free's, so no state before sign-in widens anything.
    pub fn plan_limits(&self) -> crate::plan_limits::PlanLimits {
        self.inner
            .lock()
            .profile
            .as_ref()
            .map(Self::license_limits)
            .unwrap_or_else(crate::plan_limits::PlanLimits::signed_out)
    }

    #[cfg(test)]
    pub fn set_status(&self, status: AccountStatus, error: Option<String>) {
        let mut state = self.inner.lock();
        state.status = status;
        state.error = error;
        if status != AccountStatus::Authorizing {
            state.pending_provider = None;
        }
    }

    #[cfg(test)]
    pub fn begin_authorizing(&self, provider: Option<String>) {
        let mut state = self.inner.lock();
        state.epoch += 1;
        state.status = AccountStatus::Authorizing;
        state.error = None;
        state.pending_provider = provider;
    }

    #[cfg(test)]
    pub fn set_profile(&self, profile: AccountProfile) {
        self.inner.lock().profile = Some(profile);
    }

    /// Holds the challenge a correct password bought and asks for the code.
    #[cfg(test)]
    pub fn begin_two_factor(&self, challenge: String) {
        let mut state = self.inner.lock();
        state.status = AccountStatus::TwoFactor;
        state.error = None;
        state.pending_provider = None;
        state.two_factor_challenge = Some(challenge);
    }

    #[cfg(test)]
    pub fn two_factor_challenge(&self) -> Option<String> {
        self.inner.lock().two_factor_challenge.clone()
    }

    /// Abandons the code step and returns to the sign-in form. The challenge
    /// is dropped here as well as on the backend's own expiry.
    pub fn cancel_two_factor(&self) {
        let mut state = self.inner.lock();
        state.epoch += 1;
        state.two_factor_challenge = None;
        if state.status == AccountStatus::TwoFactor {
            state.status = AccountStatus::SignedOut;
            state.error = None;
        }
    }

    /// Starts a new OAuth attempt, cancelling any previous one, and returns
    /// the cancellation flag the poll loop should watch.
    #[cfg(test)]
    pub fn begin_oauth(&self) -> Arc<AtomicBool> {
        self.oauth_cancel.begin()
    }

    pub fn cancel_oauth(&self) {
        let mut state = self.inner.lock();
        self.oauth_cancel.cancel();
        state.epoch += 1;
        if state.status == AccountStatus::Authorizing {
            state.status = AccountStatus::SignedOut;
            state.error = None;
            state.pending_provider = None;
        }
    }

    pub fn finish_oauth(&self, flag: &Arc<AtomicBool>) {
        self.oauth_cancel.finish(flag);
    }
}
