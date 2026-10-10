//! Account teardown interrupts the active provider before clearing local access.
use super::execute::Control;
use crate::account_session::AccountSessionManager;
use parking_lot::Mutex;
use std::sync::{atomic::Ordering, Arc, Weak};

static ACTIVE: Mutex<Vec<Weak<Control>>> = Mutex::new(Vec::new());

pub(super) struct Bound(Weak<Control>);

pub(super) fn bind(
    account: &AccountSessionManager,
    token: &str,
    scope: &str,
    control: &Arc<Control>,
) -> Result<Bound, String> {
    account.with_token_scope(token, scope, || {
        let bound = Arc::downgrade(control);
        let mut active = ACTIVE.lock();
        active.retain(|item| item.strong_count() > 0);
        active.push(bound.clone());
        Bound(bound)
    })
}

pub(crate) fn stop() {
    for control in ACTIVE.lock().iter().filter_map(Weak::upgrade) {
        control.cancel.store(true, Ordering::SeqCst);
    }
}

impl Drop for Bound {
    fn drop(&mut self) {
        ACTIVE
            .lock()
            .retain(|current| !current.ptr_eq(&self.0) && current.strong_count() > 0);
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
        let other = Arc::new(Control::default());
        let other_bound = bind(&account, "current", "owner", &other).unwrap();
        let dropped = Arc::new(Control::default());
        let dropped_bound = bind(&account, "current", "owner", &dropped).unwrap();
        drop(dropped_bound);
        account.with_token_scope("current", "owner", stop).unwrap();
        assert!(other.cancel.load(Ordering::SeqCst));
        assert!(!dropped.cancel.load(Ordering::SeqCst));
        drop(other_bound);
        assert!(control.cancel.load(Ordering::SeqCst));
        drop(bound);
        assert!(ACTIVE.lock().is_empty());
    }
}
