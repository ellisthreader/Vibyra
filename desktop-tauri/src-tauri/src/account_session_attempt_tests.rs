use super::*;
#[test]
fn cancelled_code_and_superseded_login_cannot_adopt_or_persist() {
    let account = AccountSessionManager::default();
    let password = account.begin_attempt(None, || {});
    account.challenge_for_attempt(password, "challenge-a".into());
    let (code, challenge) = account.begin_code_attempt().unwrap();
    assert_eq!(challenge, "challenge-a");
    account.cancel_two_factor();
    assert!(!account.adopt_attempt_with(
        code,
        "stale".into(),
        AccountProfile::default(),
        || panic!("bound stale account"),
        |_| panic!("persisted stale credential")
    ));
    let fresh = account.begin_attempt(None, || {});
    assert!(!account.status_for_attempt(
        password,
        AccountStatus::SignedOut,
        Some("late error".into())
    ));
    assert!(account.adopt_attempt_with(
        fresh,
        "B".into(),
        AccountProfile::default(),
        || {},
        |_| true
    ));
    assert!(!account.adopt_attempt_with(
        fresh,
        "duplicate".into(),
        AccountProfile::default(),
        || panic!(),
        |_| panic!()
    ));
    assert_eq!(account.token().as_deref(), Some("B"));
}
#[test]
fn restore_and_rotation_cannot_overwrite_a_new_account() {
    let account = AccountSessionManager::default();
    let restore = account.begin_restore(|| {}).unwrap();
    let login = account.begin_attempt(None, || {});
    assert!(account.adopt_attempt_with(
        login,
        "B".into(),
        AccountProfile::default(),
        || {},
        |_| true
    ));
    assert!(!account.adopt_attempt_with(
        restore,
        "A".into(),
        AccountProfile::default(),
        || panic!(),
        |_| panic!()
    ));
    assert!(!account.replace_with("A", "rotated-A".into(), |_| panic!("overwrote B key")));
    assert!(account.begin_restore(|| panic!()).is_none());
    assert_eq!(account.token().as_deref(), Some("B"));
}
#[test]
fn oauth_cancellation_invalidates_final_adoption_and_late_errors() {
    let account = AccountSessionManager::default();
    let epoch = account.begin_attempt(Some("google".into()), || {});
    account.cancel_oauth();
    assert!(!account.adopt_attempt_with(
        epoch,
        "A".into(),
        AccountProfile::default(),
        || panic!(),
        |_| panic!()
    ));
    assert!(!account.status_for_attempt(
        epoch,
        AccountStatus::SignedOut,
        Some("late provider error".into())
    ));
    assert!(account.snapshot().error.is_none());
}
