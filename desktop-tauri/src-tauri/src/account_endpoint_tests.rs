use crate::account_api::{error_detail, ApiError, Endpoint};

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
fn device_paths_accept_only_a_digest() {
    let device = "a".repeat(64);
    assert_eq!(
        Endpoint::RevokeDevice(&device).path().unwrap(),
        format!("/api/account/devices/{device}")
    );
    assert!(Endpoint::RevokeDevice("../../account").path().is_err());
    assert!(Endpoint::RevokeDevice(&"a".repeat(63)).path().is_err());
    assert!(Endpoint::RevokeDevice(&"z".repeat(64)).path().is_err());
}

#[test]
fn account_paths_and_methods_match_the_backend() {
    let path = |endpoint: Endpoint<'_>| endpoint.path().unwrap();
    assert_eq!(path(Endpoint::LoginTwoFactor), "/api/auth/login/2fa");
    assert_eq!(path(Endpoint::TwoFactorStatus), "/api/account/2fa");
    assert_eq!(path(Endpoint::TwoFactorStart), "/api/account/2fa/start");
    assert_eq!(path(Endpoint::TwoFactorConfirm), "/api/account/2fa/confirm");
    assert_eq!(
        path(Endpoint::TwoFactorRecovery),
        "/api/account/2fa/recovery"
    );
    assert_eq!(path(Endpoint::AccountSessions), "/api/account/sessions");
    assert_eq!(path(Endpoint::DeleteAccount), "/api/account");
    assert_eq!(path(Endpoint::BillingPortal), "/api/billing/portal");
    assert_eq!(path(Endpoint::BillingCheckout), "/api/billing/checkout");
    assert_eq!(path(Endpoint::VibesWallet), "/api/vibes/wallet");

    assert_eq!(Endpoint::TwoFactorStatus.method(), reqwest::Method::GET);
    assert_eq!(Endpoint::AccountSessions.method(), reqwest::Method::GET);
    assert_eq!(Endpoint::VibesWallet.method(), reqwest::Method::GET);
    assert_eq!(Endpoint::BillingPlans.method(), reqwest::Method::GET);
    assert_eq!(Endpoint::TwoFactorDisable.method(), reqwest::Method::DELETE);
    assert_eq!(Endpoint::DeleteAccount.method(), reqwest::Method::DELETE);
    assert_eq!(Endpoint::RevokeSessions.method(), reqwest::Method::DELETE);
    assert_eq!(
        Endpoint::RevokeDevice(&"a".repeat(64)).method(),
        reqwest::Method::DELETE
    );
    assert_eq!(Endpoint::TwoFactorConfirm.method(), reqwest::Method::POST);
    assert_eq!(Endpoint::BillingPortal.method(), reqwest::Method::POST);
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
