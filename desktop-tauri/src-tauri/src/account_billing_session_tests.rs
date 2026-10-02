use super::*;
use crate::account_types::AccountProfile;
use serde_json::json;

fn account() -> AccountSessionManager {
    let account = AccountSessionManager::default();
    account.set_test_session(
        "A",
        AccountProfile {
            email: "a@example.test".into(),
            email_verified: false,
            ..Default::default()
        },
    );
    account
}

#[tokio::test]
async fn catalogue_started_for_a_cannot_send_checkout_as_b() {
    let account = account();
    let action = BillingSession::capture(&account).unwrap();
    let response = action
        .request_with(|| async {
            tokio::task::yield_now().await;
            account.set_test_session(
                "B",
                AccountProfile {
                    email: "b@example.test".into(),
                    ..Default::default()
                },
            );
            Ok((200, json!({"offers":[{"offerKey":"tokens_1000"}]})))
        })
        .await;
    assert!(response.unwrap_err().contains("account changed"));
    assert!(action
        .request_with(|| async { panic!("stale checkout must never be sent") })
        .await
        .is_err());
    assert_eq!(account.token().as_deref(), Some("B"));
}

#[test]
fn late_success_and_unauthorized_results_never_open_or_sign_out_new_account() {
    let account = account();
    let action = BillingSession::capture(&account).unwrap();
    account.set_test_session("B", AccountProfile::default());
    for status in [200, 401, 403] {
        assert!(action
            .finish(Ok((
                status,
                json!({"url":"https://billing.stripe.com/session/a"})
            )))
            .is_err());
        assert_eq!(account.token().as_deref(), Some("B"));
        assert_eq!(account.snapshot().status, "signedIn");
    }
    assert!(action
        .perform::<()>(|| panic!("old portal must not open"))
        .is_err());
}

#[test]
fn valid_response_cannot_open_after_switch_between_response_and_browser() {
    let account = account();
    let action = BillingSession::capture(&account).unwrap();
    action
        .finish(Ok((
            200,
            json!({"url":"https://billing.stripe.com/session/a"}),
        )))
        .unwrap();
    account.set_test_session("B", AccountProfile::default());
    assert!(action
        .perform::<()>(|| panic!("old checkout must not open"))
        .is_err());
}

#[test]
fn unverified_checkout_403_preserves_session_and_real_pty() {
    use std::sync::Arc;
    use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
    struct Sink;
    impl OutputSink for Sink {
        fn on_output(&self, _: u64, _: String) {}
        fn on_resync(&self, _: u64, _: String) {}
        fn on_exit(&self, _: u64, _: Option<i32>) {}
    }
    let account = account();
    let action = BillingSession::capture(&account).unwrap();
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let terminal = manager
        .create_session(
            "shell",
            "billing-fixture",
            &LaunchSpec::shell(Some("/bin/sh".into()), None),
        )
        .unwrap();
    for status in [403, 401, 429, 503] {
        let message = "Verify your email before checking out.";
        assert_eq!(
            action
                .finish(Ok((status, json!({"error":message}))))
                .unwrap_err(),
            message
        );
        assert_eq!(account.token().as_deref(), Some("A"));
        assert_eq!(account.snapshot().status, "signedIn");
        assert!(!account.snapshot().profile.unwrap().email_verified);
        assert!(manager.process_id(terminal.id).unwrap().is_some());
    }
    manager
        .write_input(terminal.id, b"printf billing-session-preserved\n")
        .unwrap();
    manager.shutdown();
}
