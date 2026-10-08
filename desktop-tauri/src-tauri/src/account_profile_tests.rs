use super::*;
use crate::account_session::AccountSessionManager;
use crate::account_types::AccountProfile;

#[test]
fn rejected_profile_change_preserves_signed_in_profile_and_running_terminal() {
    use std::sync::Arc;
    use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
    struct Sink;
    impl OutputSink for Sink {
        fn on_output(&self, _: u64, _: String) {}
        fn on_resync(&self, _: u64, _: String) {}
        fn on_exit(&self, _: u64, _: Option<i32>) {}
    }
    let account = AccountSessionManager::default();
    account.set_test_session(
        "profile-test",
        AccountProfile {
            email: "before@example.test".into(),
            ..Default::default()
        },
    );
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let spec = LaunchSpec::shell(Some("/bin/sh".into()), None);
    let terminal = manager
        .create_session("shell", "profile-fixture", &spec)
        .unwrap();
    for error in [
        ApiError::Unauthorized("Enter your current password to change your email.".into()),
        ApiError::Rejected("That email is already in use.".into()),
        ApiError::Network("Try again.".into()),
    ] {
        assert_eq!(
            apply_update(&account, "profile-test", Err(error.clone())).unwrap_err(),
            error.message()
        );
        assert_eq!(account.snapshot().status, "signedIn");
        assert_eq!(
            account.snapshot().profile.unwrap().email,
            "before@example.test"
        );
        assert!(manager.process_id(terminal.id).unwrap().is_some());
    }
    manager
        .write_input(terminal.id, "printf profile-preserved\n".as_bytes())
        .unwrap();
    manager.shutdown();
}

#[test]
fn successful_email_change_adopts_unverified_profile_without_signing_out() {
    let account = AccountSessionManager::default();
    account.set_test_session("profile-test", AccountProfile::default());
    let result = apply_update(
        &account,
        "profile-test",
        Ok(serde_json::json!({"user": {
            "name": "Fixture", "email": "after@example.test", "provider": "email",
            "emailVerified": false, "plan": "free"
        }})),
    )
    .unwrap();
    assert_eq!(result.status, "signedIn");
    assert_eq!(result.profile.unwrap().email, "after@example.test");
    assert!(!account.snapshot().profile.unwrap().email_verified);
    assert!(apply_update(
        &account,
        "profile-test",
        Ok(serde_json::json!({"ok": true}))
    )
    .is_err());
    assert_eq!(
        account.snapshot().profile.unwrap().email,
        "after@example.test"
    );
}

#[test]
fn stale_profile_update_cannot_replace_a_newer_account() {
    let account = AccountSessionManager::default();
    account.set_test_session(
        "new-session",
        AccountProfile {
            email: "new@example.test".into(),
            ..Default::default()
        },
    );
    let response = Ok(serde_json::json!({"user":{"email":"old@example.test","plan":"pro"}}));
    assert!(apply_update(&account, "old-session", response).is_err());
    assert_eq!(
        account.snapshot().profile.unwrap().email,
        "new@example.test"
    );
    assert_eq!(account.token().as_deref(), Some("new-session"));
}
