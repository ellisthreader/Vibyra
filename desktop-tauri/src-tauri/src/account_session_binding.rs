use super::{AccountProfile, AccountSessionManager, AccountStatus, SecretStore};

const CHANGED: &str = "Your account changed. Reopen Settings and try again.";

impl AccountSessionManager {
    /// Finish a synchronous side effect only for the captured session. The
    /// callback runs under the account lock and must not re-enter this manager.
    pub(crate) fn with_token<T>(
        &self,
        token: &str,
        action: impl FnOnce() -> T,
    ) -> Result<T, String> {
        self.with_bound(token, None, action)
    }

    pub(crate) fn with_token_scope<T>(
        &self,
        token: &str,
        scope: &str,
        action: impl FnOnce() -> T,
    ) -> Result<T, String> {
        self.with_bound(token, Some(scope), action)
    }

    fn with_bound<T>(
        &self,
        token: &str,
        scope: Option<&str>,
        action: impl FnOnce() -> T,
    ) -> Result<T, String> {
        let state = self.inner.lock();
        if state.token.as_deref() != Some(token)
            || scope.is_some_and(|scope| {
                state
                    .profile
                    .as_ref()
                    .map(|profile| profile.welcome_key.as_str())
                    != Some(scope)
            })
        {
            return Err(CHANGED.into());
        }
        let result = action();
        drop(state);
        Ok(result)
    }

    pub(crate) fn set_profile_for_token(&self, token: &str, profile: AccountProfile) -> bool {
        let mut state = self.inner.lock();
        if state.token.as_deref() != Some(token) {
            return false;
        }
        state.profile = Some(profile);
        true
    }

    /// Authoritative session rejection only. Cleanup must not re-enter this
    /// manager. Persist under the lock so a new login cannot lose its credential.
    pub(crate) fn reject_for_token(&self, token: &str, stop: impl FnOnce()) -> bool {
        self.reject_bound(token, stop, || {
            if SecretStore.write_account_session(None).is_err() {
                eprintln!("Vibyra could not clear the rejected stored account session");
            }
        })
    }

    fn reject_bound(&self, token: &str, stop: impl FnOnce(), persist: impl FnOnce()) -> bool {
        let mut state = self.inner.lock();
        if state.token.as_deref() != Some(token) {
            return false;
        }
        state.epoch = state.epoch.wrapping_add(1);
        stop();
        state.token = None;
        state.profile = None;
        state.status = AccountStatus::SignedOut;
        state.error = None;
        state.pending_provider = None;
        state.two_factor_challenge = None;
        persist();
        true
    }

    #[cfg(test)]
    pub(crate) fn set_test_session(&self, token: &str, profile: AccountProfile) {
        let mut state = self.inner.lock();
        state.epoch = state.epoch.wrapping_add(1);
        state.token = Some(token.into());
        state.profile = Some(profile);
        state.status = AccountStatus::SignedIn;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn late_success_and_rejection_never_touch_a_replacement_session() {
        let account = AccountSessionManager::default();
        account.set_test_session(
            "B",
            AccountProfile {
                email: "b@example.test".into(),
                ..Default::default()
            },
        );
        assert!(account
            .with_token("A", || panic!("opened stale account portal"))
            .is_err());
        assert!(!account.set_profile_for_token("A", AccountProfile::default()));
        assert!(!account.reject_bound(
            "A",
            || panic!("stopped B"),
            || panic!("cleared B credential")
        ));
        assert_eq!(account.token().as_deref(), Some("B"));
        assert_eq!(account.snapshot().profile.unwrap().email, "b@example.test");
        assert!(account.reject_bound("B", || {}, || {}));
        assert!(account.token().is_none());
    }
}
