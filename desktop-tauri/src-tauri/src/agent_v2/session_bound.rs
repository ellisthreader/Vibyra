//! Account teardown interrupts the active provider before clearing local access.
use super::execute::Control;
use crate::account_session::AccountSessionManager;
use parking_lot::Mutex;
use std::sync::{atomic::Ordering, Arc, Weak};

static ACTIVE: Mutex<Option<Weak<Control>>> = Mutex::new(None);

pub(super) struct Bound(Weak<Control>);

pub(super) fn bind(
    account: &AccountSessionManager,
    token: &str,
    scope: &str,
    control: &Arc<Control>,
) -> Result<Bound, String> {
    account.with_token_scope(token, scope, || {
        let bound = Arc::downgrade(control);
        *ACTIVE.lock() = Some(bound.clone());
        Bound(bound)
    })
}

pub(crate) fn stop() {
    if let Some(control) = ACTIVE.lock().as_ref().and_then(Weak::upgrade) {
        control.cancel.store(true, Ordering::SeqCst);
    }
}

impl Drop for Bound {
    fn drop(&mut self) {
        let mut active = ACTIVE.lock();
        if active
            .as_ref()
            .is_some_and(|current| current.ptr_eq(&self.0))
        {
            *active = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account_types::AccountProfile;
    #[test]
    fn teardown_cancels_bound_run_and_stale_sessions_cannot_bind() {
        let account = AccountSessionManager::default();
        account.set_test_session(
            "current",
            AccountProfile {
                welcome_key: "owner".into(),
                ..Default::default()
            },
        );
        let control = Arc::new(Control::default());
        assert!(bind(&account, "old", "owner", &control).is_err());
        assert!(bind(&account, "current", "other", &control).is_err());
        let bound = bind(&account, "current", "owner", &control).unwrap();
        account.with_token_scope("current", "owner", stop).unwrap();
        assert!(control.cancel.load(Ordering::SeqCst));
        drop(bound);
        assert!(ACTIVE.lock().is_none());
    }
}
