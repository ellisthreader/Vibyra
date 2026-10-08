use super::require_target;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering::SeqCst};

#[test]
fn target_loss_stops_later_batch_effects() {
    let focused = AtomicBool::new(true);
    let effects = AtomicUsize::new(0);
    let authority = || Ok(());
    let check = || {
        require_target(&authority, || {
            focused
                .load(SeqCst)
                .then_some(())
                .ok_or("Focus moved".into())
        })
    };
    for _ in 0..512 {
        if check().is_err() {
            break;
        }
        effects.fetch_add(1, SeqCst);
        focused.store(false, SeqCst);
    }
    assert_eq!(effects.load(SeqCst), 1);
}

#[test]
fn revoke_during_target_read_emits_no_new_effect() {
    let allowed = AtomicBool::new(true);
    let effects = AtomicUsize::new(0);
    let check = || allowed.load(SeqCst).then_some(()).ok_or("Revoked".into());
    let result = require_target(&check, || {
        allowed.store(false, SeqCst);
        Ok(())
    });
    if result.is_ok() {
        effects.fetch_add(1, SeqCst);
    }
    assert!(result.is_err());
    assert_eq!(effects.load(SeqCst), 0);
}

#[test]
fn denied_authority_does_not_query_target() {
    let queries = AtomicUsize::new(0);
    let result = require_target(&super::denied, || {
        queries.fetch_add(1, SeqCst);
        Ok(())
    });
    assert!(result.is_err());
    assert_eq!(queries.load(SeqCst), 0);
}

#[test]
fn explicit_local_authority_can_target_a_focused_window() {
    let checks = AtomicUsize::new(0);
    let check = || {
        checks.fetch_add(1, SeqCst);
        Ok(())
    };
    assert!(require_target(&check, || Ok(())).is_ok());
    assert_eq!(checks.load(SeqCst), 2);
}
