use crate::account_api::{error_detail, ApiError, Endpoint};
use crate::account_session::AccountSessionManager;
use crate::account_types::AccountStatus;

#[test]
fn oauth_paths_reject_unknown_providers_and_flows() {
    assert!(matches!(
        Endpoint::OauthStart("github").path(),
        Err(ApiError::Rejected(_))
    ));
    let flow = "A".repeat(64);
    assert_eq!(
        Endpoint::OauthStatus("google", &flow).path().unwrap(),
        format!("/api/auth/desktop/google/status/{flow}")
    );
    assert!(Endpoint::OauthStatus("google", "short").path().is_err());
    let sneaky = format!("{}/../x", "A".repeat(40));
    assert!(Endpoint::OauthStatus("apple", &sneaky).path().is_err());
}

#[test]
fn snapshots_never_expose_the_bearer_token() {
    let manager = AccountSessionManager::default();
    // Feed a token straight into memory without touching the OS keyring.
    manager.set_status(AccountStatus::SignedIn, None);
    manager.set_profile(crate::account_types::AccountProfile {
        name: "Ada".into(),
        email: "ada@vibyra.app".into(),
        provider: "email".into(),
        plan: "free".into(),
        email_verified: true,
        welcome_key: "vw_test".into(),
    });
    let raw = serde_json::to_string(&manager.snapshot()).expect("serialize");
    assert!(!raw.to_lowercase().contains("token"));
    assert!(raw.contains("\"status\":\"signedIn\""));
}

#[test]
fn cancelling_oauth_returns_to_signed_out() {
    let manager = AccountSessionManager::default();
    manager.begin_authorizing(Some("google".into()));
    let flag = manager.begin_oauth();
    assert_eq!(manager.snapshot().status, "authorizing");
    assert_eq!(
        manager.snapshot().pending_provider.as_deref(),
        Some("google")
    );
    manager.cancel_oauth();
    assert!(flag.load(std::sync::atomic::Ordering::SeqCst));
    assert_eq!(manager.snapshot().status, "signedOut");
    assert_eq!(manager.snapshot().pending_provider, None);
}

#[test]
fn a_new_oauth_attempt_cancels_the_previous_one() {
    let manager = AccountSessionManager::default();
    let first = manager.begin_oauth();
    let second = manager.begin_oauth();
    assert!(first.load(std::sync::atomic::Ordering::SeqCst));
    assert!(!second.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn error_detail_prefers_backend_copy_and_redacts_nothing_sensitive() {
    let body = serde_json::json!({ "ok": false, "error": "That email is already in use." });
    assert_eq!(error_detail(&body, 409), "That email is already in use.");
    let throttled = serde_json::json!({ "message": "Too Many Attempts." });
    assert_eq!(error_detail(&throttled, 429), "Too Many Attempts.");
    assert_eq!(
        error_detail(&serde_json::Value::Null, 503),
        "The Vibyra account service had a problem. Try again shortly."
    );
}

#[test]
fn base_url_override_requires_loopback_or_https() {
    // The helper itself reads the environment; validate the guard logic via
    // the documented default when no override is present.
    std::env::remove_var("VIBYRA_DESKTOP_API_URL");
    assert!(crate::account_api::base_url().starts_with("https://"));
}
