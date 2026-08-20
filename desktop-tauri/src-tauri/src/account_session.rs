use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;

use crate::account_types::{AccountProfile, AccountSnapshot, AccountStatus};
use crate::secret_store::SecretStore;

struct SessionState {
    status: AccountStatus,
    token: Option<String>,
    profile: Option<AccountProfile>,
    error: Option<String>,
    pending_provider: Option<String>,
    secure_storage: bool,
}

/// Owns the Vibyra account session: the in-memory bearer token, the coarse
/// renderer-facing status, and the OS credential entry. The token is only
/// readable through `token()` inside native code.
pub struct AccountSessionManager {
    inner: Mutex<SessionState>,
    oauth_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

impl Default for AccountSessionManager {
    fn default() -> Self {
        Self {
            inner: Mutex::new(SessionState {
                status: AccountStatus::Restoring,
                token: None,
                profile: None,
                error: None,
                pending_provider: None,
                secure_storage: true,
            }),
            oauth_cancel: Mutex::new(None),
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

    pub fn set_status(&self, status: AccountStatus, error: Option<String>) {
        let mut state = self.inner.lock();
        state.status = status;
        state.error = error;
        if status != AccountStatus::Authorizing {
            state.pending_provider = None;
        }
    }

    pub fn begin_authorizing(&self, provider: Option<String>) {
        let mut state = self.inner.lock();
        state.status = AccountStatus::Authorizing;
        state.error = None;
        state.pending_provider = provider;
    }

    pub fn set_profile(&self, profile: AccountProfile) {
        self.inner.lock().profile = Some(profile);
    }

    /// Installs a verified session: persists the token to the OS credential
    /// store first, then swaps it into memory. When the store is unavailable
    /// the session continues for this process only and the snapshot says so.
    pub fn adopt_session(&self, store: &SecretStore, token: String, profile: AccountProfile) {
        let persisted = match store.write_account_session(Some(&token)) {
            Ok(()) => true,
            Err(error) => {
                eprintln!("Vibyra could not persist the account session: {error}");
                false
            }
        };
        let mut state = self.inner.lock();
        state.token = Some(token);
        state.profile = Some(profile);
        state.status = AccountStatus::SignedIn;
        state.error = None;
        state.pending_provider = None;
        state.secure_storage = persisted;
    }

    /// Replaces the token after a rotation. The new token is written to the
    /// credential store before memory so a crash never strands a stale entry.
    pub fn replace_token(&self, store: &SecretStore, token: String) {
        let persisted = store.write_account_session(Some(&token)).is_ok();
        let mut state = self.inner.lock();
        state.token = Some(token);
        if !persisted {
            state.secure_storage = false;
        }
    }

    pub fn mark_secure_storage(&self, available: bool) {
        self.inner.lock().secure_storage = available;
    }

    /// Clears the credential entry and every trace of the session, returning
    /// the manager to the signed-out state.
    pub fn clear_session(&self, store: &SecretStore) {
        if let Err(error) = store.write_account_session(None) {
            eprintln!("Vibyra could not clear the stored account session: {error}");
        }
        let mut state = self.inner.lock();
        state.token = None;
        state.profile = None;
        state.status = AccountStatus::SignedOut;
        state.error = None;
        state.pending_provider = None;
    }

    /// Starts a new OAuth attempt, cancelling any previous one, and returns
    /// the cancellation flag the poll loop should watch.
    pub fn begin_oauth(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Some(previous) = self.oauth_cancel.lock().replace(Arc::clone(&flag)) {
            previous.store(true, Ordering::SeqCst);
        }
        flag
    }

    pub fn cancel_oauth(&self) {
        if let Some(flag) = self.oauth_cancel.lock().take() {
            flag.store(true, Ordering::SeqCst);
        }
        let mut state = self.inner.lock();
        if state.status == AccountStatus::Authorizing {
            state.status = AccountStatus::SignedOut;
            state.error = None;
            state.pending_provider = None;
        }
    }

    pub fn finish_oauth(&self, flag: &Arc<AtomicBool>) {
        let mut guard = self.oauth_cancel.lock();
        if guard
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, flag))
        {
            *guard = None;
        }
    }
}
