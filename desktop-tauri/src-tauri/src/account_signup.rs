use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const TERMS_VERSION: &str = "2026-09-28";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSignupDeclarations {
    terms_version: String,
    terms_accepted: bool,
    adult_confirmed: bool,
    country_code: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    license_key: Option<String>,
}

impl AccountSignupDeclarations {
    pub fn add_to(&self, body: &mut Value) -> Result<(), &'static str> {
        if self.terms_version != TERMS_VERSION
            || !self.terms_accepted
            || !self.adult_confirmed
            || self.country_code != "GB"
        {
            return Err(
                "Confirm the current Terms, age and UK residence before creating an account.",
            );
        }
        if self.license_key.as_ref().is_some_and(|key| key.len() > 100) {
            return Err("The license key is too long.");
        }
        let fields =
            serde_json::to_value(self).map_err(|_| "Account declaration could not be saved.")?;
        let Some(destination) = body.as_object_mut() else {
            return Err("Account declaration could not be saved.");
        };
        destination.extend(
            fields
                .as_object()
                .expect("signup declarations serialize as an object")
                .clone(),
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn declaration_payload_requires_current_version_and_all_confirmations() {
        let good = AccountSignupDeclarations {
            terms_version: TERMS_VERSION.into(),
            terms_accepted: true,
            adult_confirmed: true,
            country_code: "GB".into(),
            license_key: None,
        };
        let mut body = serde_json::json!({"deviceName": "Mac"});
        good.add_to(&mut body).unwrap();
        assert_eq!(body["termsVersion"], TERMS_VERSION);
        assert_eq!(body["termsAccepted"], true);
        assert_eq!(body["adultConfirmed"], true);
        assert_eq!(body["countryCode"], "GB");
        assert_eq!(body["deviceName"], "Mac");

        assert!(body.get("licenseKey").is_none());
        let licensed = AccountSignupDeclarations {
            license_key: Some("VPRO-test".into()),
            ..good.clone()
        };
        licensed.add_to(&mut body).unwrap();
        assert_eq!(body["licenseKey"], "VPRO-test");

        for invalid in [
            AccountSignupDeclarations {
                license_key: Some("x".repeat(101)),
                ..good.clone()
            },
            AccountSignupDeclarations {
                terms_accepted: false,
                ..good.clone()
            },
            AccountSignupDeclarations {
                adult_confirmed: false,
                ..good.clone()
            },
            AccountSignupDeclarations {
                country_code: "FR".into(),
                ..good.clone()
            },
            AccountSignupDeclarations {
                terms_version: "2026-09-27".into(),
                ..good
            },
        ] {
            assert!(invalid.add_to(&mut serde_json::json!({})).is_err());
        }
    }
}
