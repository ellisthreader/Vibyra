use crate::account_session::AccountSessionManager;
use crate::account_types::{profile_from_user, AccountProfile, AccountSnapshot, AccountStatus};

#[test]
fn profile_parses_safe_fields_only() {
    let user = serde_json::json!({
        "id": 7, "name": "Ada", "email": "ada@vibyra.app", "provider": "google",
        "plan": "pro", "emailVerified": true, "creditsBalance": 50,
        "stripeCustomerId": "cus_123"
    });
    let profile = profile_from_user(&user).expect("profile");
    assert_eq!(profile.name, "Ada");
    assert_eq!(profile.provider, "google");
    assert!(profile.email_verified);
    assert!(profile.welcome_key.starts_with("vw_"));
    let raw = serde_json::to_string(&profile).expect("serialize");
    assert!(!raw.contains("creditsBalance"));
    assert!(!raw.contains("stripeCustomerId"));
    assert!(!raw.contains("\"id\""));
}

#[test]
fn profile_carries_the_membership_facts_the_account_page_states() {
    let user = serde_json::json!({
        "id": 9, "email": "ada@vibyra.app", "plan": "builder",
        "planBillingCycle": "annual", "planRenewsAt": "2026-10-12T00:00:00+00:00",
        "creditsResetAt": "2026-10-12T00:00:00+00:00",
        "membershipEndsAt": "2026-10-12T00:00:00+00:00",
        "membershipCancelAtPeriodEnd": true, "billingProvider": "stripe",
        "canManageStripeBilling": true, "twoFactorEnabled": true,
        "createdAt": "2026-03-02T09:00:00+00:00", "avatarUrl": "https://vibyra.app/a.png"
    });
    let profile = profile_from_user(&user).expect("profile");
    assert_eq!(profile.plan_billing_cycle, "annual");
    assert_eq!(
        profile.plan_renews_at.as_deref(),
        Some("2026-10-12T00:00:00+00:00")
    );
    assert!(profile.membership_cancel_at_period_end);
    assert_eq!(profile.billing_provider.as_deref(), Some("stripe"));
    assert!(profile.can_manage_stripe_billing);
    assert!(profile.two_factor_enabled);
    assert!(profile.has_avatar);
    // The address itself stays native: the renderer cannot reach it anyway.
    let raw = serde_json::to_string(&profile).expect("serialize");
    assert!(!raw.contains("avatarUrl"));
    assert!(raw.contains("\"hasAvatar\":true"));
}

#[test]
fn an_older_server_leaves_the_new_fields_absent() {
    let profile = profile_from_user(&serde_json::json!({
        "id": 3, "email": "ada@vibyra.app", "name": "Ada"
    }))
    .expect("profile");
    assert_eq!(profile.plan, "free");
    assert_eq!(profile.plan_billing_cycle, "monthly");
    assert_eq!(profile.plan_renews_at, None);
    assert_eq!(profile.membership_ends_at, None);
    assert_eq!(profile.billing_provider, None);
    assert!(!profile.membership_cancel_at_period_end);
    assert!(!profile.two_factor_enabled);
    assert!(!profile.has_avatar);
}

#[test]
fn an_unknown_billing_cycle_is_read_as_monthly() {
    let profile = profile_from_user(&serde_json::json!({
        "email": "ada@vibyra.app", "planBillingCycle": "weekly"
    }))
    .expect("profile");
    assert_eq!(profile.plan_billing_cycle, "monthly");
}

#[test]
fn profile_requires_an_email() {
    assert!(profile_from_user(&serde_json::json!({ "name": "x" })).is_none());
    assert!(profile_from_user(&serde_json::json!({ "email": "  " })).is_none());
}

#[test]
fn welcome_scope_survives_profile_email_changes() {
    let first = profile_from_user(&serde_json::json!({
        "id": 42, "email": "first@vibyra.app"
    }))
    .expect("first profile");
    let changed = profile_from_user(&serde_json::json!({
        "id": 42, "email": "changed@vibyra.app"
    }))
    .expect("changed profile");
    assert_eq!(first.welcome_key, changed.welcome_key);
    assert!(!first.welcome_key.contains("42"));
}

#[test]
fn snapshot_serialization_never_carries_credentials() {
    let snapshot = AccountSnapshot {
        status: "signedIn",
        profile: Some(AccountProfile {
            name: "Ada".into(),
            email: "ada@vibyra.app".into(),
            provider: "email".into(),
            plan: "free".into(),
            welcome_key: "vw_test".into(),
            ..Default::default()
        }),
        error: None,
        pending_provider: None,
        secure_storage: true,
    };
    let raw = serde_json::to_string(&snapshot).expect("serialize");
    assert!(!raw.to_lowercase().contains("token"));
    assert!(!raw.to_lowercase().contains("secret"));
    assert!(raw.contains("\"secureStorage\":true"));
}

#[test]
fn snapshots_never_expose_the_bearer_token() {
    let manager = AccountSessionManager::default();
    manager.set_status(AccountStatus::SignedIn, None);
    manager.set_profile(AccountProfile {
        name: "Ada".into(),
        email: "ada@vibyra.app".into(),
        provider: "email".into(),
        plan: "free".into(),
        email_verified: true,
        welcome_key: "vw_test".into(),
        ..Default::default()
    });
    let raw = serde_json::to_string(&manager.snapshot()).expect("serialize");
    assert!(!raw.to_lowercase().contains("token"));
    assert!(raw.contains("\"status\":\"signedIn\""));
}

#[test]
fn a_held_two_factor_challenge_never_reaches_the_renderer() {
    let manager = AccountSessionManager::default();
    manager.begin_two_factor("challenge-9f3a".into());
    let snapshot = manager.snapshot();
    assert_eq!(snapshot.status, "twoFactor");
    let raw = serde_json::to_string(&snapshot).expect("serialize");
    assert!(!raw.contains("challenge-9f3a"));
    assert_eq!(
        manager.two_factor_challenge().as_deref(),
        Some("challenge-9f3a")
    );
    manager.cancel_two_factor();
    assert_eq!(manager.snapshot().status, "signedOut");
    assert_eq!(manager.two_factor_challenge(), None);
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
fn the_deletion_flag_is_independent_of_a_sign_in() {
    let manager = AccountSessionManager::default();
    let sign_in = manager.begin_oauth();
    let deletion = manager.delete_cancel.begin();
    manager.delete_cancel.cancel();
    assert!(deletion.load(std::sync::atomic::Ordering::SeqCst));
    assert!(!sign_in.load(std::sync::atomic::Ordering::SeqCst));
}
