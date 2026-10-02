//! An old background HTTP response may only reject the session it captured.
use super::{AccountSessionManager, AccountStatus, SecretStore};
impl AccountSessionManager {
    pub(crate) fn reject_remote_token(
        &self,
        token: &str,
        account: &str,
        stop_remote: impl FnOnce() -> bool,
    ) -> bool {
        self.reject_remote_with(token, account, stop_remote, || {
            if SecretStore.write_account_session(None).is_err() {
                eprintln!("Vibyra could not clear the rejected stored account session");
            }
        })
    }
    fn reject_remote_with(
        &self,
        token: &str,
        account: &str,
        stop_remote: impl FnOnce() -> bool,
        persist: impl FnOnce(),
    ) -> bool {
        let mut state = self.inner.lock();
        if state.token.as_deref() != Some(token)
            || state
                .profile
                .as_ref()
                .map(|profile| profile.welcome_key.as_str())
                != Some(account)
        {
            return false;
        }
        if !stop_remote() {
            return false;
        }
        state.epoch = state.epoch.wrapping_add(1);
        state.token = None;
        state.profile = None;
        state.status = AccountStatus::SignedOut;
        state.error = None;
        state.pending_provider = None;
        state.two_factor_challenge = None;
        persist();
        true
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    #[test]
    fn delayed_rejection_cannot_end_or_clear_a_replacement_account_or_token() {
        let account = AccountSessionManager::default();
        {
            let mut state = account.inner.lock();
            state.token = Some("fresh".into());
            state.profile = Some(crate::account_types::AccountProfile {
                welcome_key: "b".into(),
                ..Default::default()
            });
        }
        for (token, scope) in [("old", "a"), ("old", "b"), ("fresh", "a")] {
            assert!(!account.reject_remote_with(
                token,
                scope,
                || panic!("new account stopped"),
                || panic!("new token cleared")
            ));
        }
        assert!(!account.reject_remote_with(
            "fresh",
            "b",
            || false,
            || panic!("checkpoint mismatch cleared account")
        ));
        assert_eq!(account.token().as_deref(), Some("fresh"));
        let stopped = AtomicBool::new(false);
        assert!(account.reject_remote_with(
            "fresh",
            "b",
            || {
                stopped.store(true, Ordering::SeqCst);
                true
            },
            || assert!(stopped.load(Ordering::SeqCst))
        ));
        assert!(account.token().is_none());
    }
}
