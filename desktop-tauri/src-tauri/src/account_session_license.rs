use super::AccountSessionManager;
use crate::account_types::{AccountProfile, AccountSnapshot, AccountStatus};

impl AccountSessionManager {
    pub(crate) fn license_limits(profile: &AccountProfile) -> crate::plan_limits::PlanLimits {
        if profile.billing_provider.as_deref() == Some("license") && profile.plan_limits.enforced {
            let valid = profile
                .plan_limits
                .paid_until
                .as_deref()
                .and_then(|date| chrono::DateTime::parse_from_rfc3339(date).ok())
                .is_some_and(|end| end > chrono::Utc::now());
            if !valid {
                return crate::plan_limits::PlanLimits::signed_out();
            }
        }
        profile
            .plan_limits
            .effective_at(chrono::Utc::now().timestamp_millis())
    }

    pub(crate) fn license_token(&self, scope: &str) -> Result<String, String> {
        let state = self.inner.lock();
        if state.status != AccountStatus::SignedIn
            || state.profile.as_ref().map(|p| p.welcome_key.as_str()) != Some(scope)
        {
            return Err("Your account changed. Reopen Settings before redeeming.".into());
        }
        state
            .token
            .clone()
            .ok_or("Sign in before redeeming.".into())
    }

    pub(crate) fn apply_license_profile(
        &self,
        token: &str,
        scope: &str,
        profile: AccountProfile,
    ) -> Result<AccountSnapshot, String> {
        let mut state = self.inner.lock();
        if state.token.as_deref() != Some(token)
            || state.profile.as_ref().map(|p| p.welcome_key.as_str()) != Some(scope)
            || profile.welcome_key != scope
        {
            return Err("Your account changed. Reopen Settings to check the license.".into());
        }
        state.profile = Some(profile);
        Ok(AccountSnapshot {
            status: state.status.as_str(),
            profile: state.profile.clone(),
            error: state.error.clone(),
            pending_provider: state.pending_provider.clone(),
            secure_storage: state.secure_storage,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn license_expiry_is_enforced_without_a_network_refresh() {
        let mut profile = AccountProfile {
            billing_provider: Some("license".into()),
            ..Default::default()
        };
        profile.plan_limits.enforced = true;
        profile.plan_limits.paid_until = Some("2020-01-01T00:00:00Z".into());
        assert_eq!(
            AccountSessionManager::license_limits(&profile),
            crate::plan_limits::PlanLimits::signed_out()
        );
        profile.plan_limits.paid_until = Some("2999-01-01T00:00:00Z".into());
        assert_eq!(
            AccountSessionManager::license_limits(&profile),
            profile.plan_limits
        );
    }

    #[test]
    fn admission_expires_dated_plans_preserving_license_rules_and_cached_profile() {
        let account = AccountSessionManager::default();
        let mut profile = AccountProfile {
            plan: "pro_v2".into(),
            ..Default::default()
        };
        profile.plan_limits.enforced = true;
        profile.plan_limits.paid_until = Some("2020-01-01T00:00:00Z".into());
        for provider in ["stripe", "apple", "license"] {
            profile.billing_provider = Some(provider.into());
            account.set_test_session("test", profile.clone());
            assert_eq!(
                account.plan_limits(),
                crate::plan_limits::PlanLimits::signed_out()
            );
            assert_eq!(account.snapshot().profile.unwrap().plan, "pro_v2");
        }
        profile.plan_limits.paid_until = None;
        assert_eq!(
            AccountSessionManager::license_limits(&profile),
            crate::plan_limits::PlanLimits::signed_out()
        );
        profile.billing_provider = Some("stripe".into());
        assert_eq!(
            AccountSessionManager::license_limits(&profile),
            profile.plan_limits
        );
    }

    #[test]
    fn license_admission_and_delayed_profile_are_bound_to_the_displayed_account() {
        let account = AccountSessionManager::default();
        let profile = AccountProfile {
            welcome_key: "new-user".into(),
            plan: "free".into(),
            ..Default::default()
        };
        {
            let mut state = account.inner.lock();
            state.status = AccountStatus::SignedIn;
            state.token = Some("new-token".into());
            state.profile = Some(profile.clone());
        }
        assert!(account.license_token("old-user").is_err());
        assert_eq!(account.license_token("new-user").unwrap(), "new-token");
        assert!(account
            .apply_license_profile("old-token", "new-user", profile.clone())
            .is_err());
        assert!(account
            .apply_license_profile("new-token", "old-user", profile.clone())
            .is_err());
        assert_eq!(account.snapshot().profile.unwrap().plan, "free");
        let updated = AccountProfile {
            plan: "pro_v2".into(),
            ..profile
        };
        assert_eq!(
            account
                .apply_license_profile("new-token", "new-user", updated)
                .unwrap()
                .profile
                .unwrap()
                .plan,
            "pro_v2"
        );
    }
}
