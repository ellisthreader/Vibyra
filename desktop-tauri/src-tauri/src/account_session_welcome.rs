use super::AccountSessionManager;
use crate::account_types::AccountStatus;

impl AccountSessionManager {
    pub(crate) fn acknowledge_license_welcome(
        &self,
        token: &str,
        scope: &str,
        id: &str,
    ) -> Result<(), String> {
        let mut state = self.inner.lock();
        if state.status != AccountStatus::SignedIn
            || state.token.as_deref() != Some(token)
            || state.profile.as_ref().map(|p| p.welcome_key.as_str()) != Some(scope)
        {
            return Err("Your account changed.".into());
        }
        if let Some(license) = state.profile.as_mut().and_then(|p| p.license.as_mut()) {
            if license.beta_welcome.as_ref().map(|w| w.id.as_str()) == Some(id) {
                license.beta_welcome = None;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account_types::AccountProfile;
    use serde_json::json;

    #[test]
    fn delayed_ack_is_scoped_and_preserves_newer_profile_fields() {
        let manager = AccountSessionManager::default();
        let profile = AccountProfile {
            welcome_key: "scope".into(),
            name: "Updated name".into(),
            license: Some(
                serde_json::from_value(json!({"tokens":42,"allowance":"once",
                "endsAt":"2999-01-01T00:00:00Z", "betaWelcome": {
                    "id":"00000000-0000-4000-8000-000000000001", "months":1}}))
                .unwrap(),
            ),
            ..Default::default()
        };
        manager.set_test_session("token", profile);
        let id = "00000000-0000-4000-8000-000000000001";
        assert!(manager
            .acknowledge_license_welcome("old", "scope", id)
            .is_err());
        assert!(manager
            .acknowledge_license_welcome("token", "other", id)
            .is_err());
        manager
            .acknowledge_license_welcome("token", "scope", "other-license")
            .unwrap();
        assert!(manager
            .snapshot()
            .profile
            .unwrap()
            .license
            .unwrap()
            .beta_welcome
            .is_some());
        manager
            .acknowledge_license_welcome("token", "scope", id)
            .unwrap();
        let current = manager.snapshot().profile.unwrap();
        assert_eq!(current.name, "Updated name");
        let license = current.license.unwrap();
        assert_eq!(license.tokens, 42);
        assert!(license.beta_welcome.is_none());
        manager
            .acknowledge_license_welcome("token", "scope", id)
            .unwrap();
    }
}
