use serde::{Deserialize, Deserializer, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccountLicense {
    pub tokens: u32,
    pub allowance: String,
    pub ends_at: String,
    pub next_at: Option<String>,
    #[serde(default, deserialize_with = "welcome")]
    pub beta_welcome: Option<BetaWelcome>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct BetaWelcome {
    pub id: String,
    pub months: Option<u32>,
}

// A malformed optional notice must never discard the membership itself.
fn welcome<'de, D: Deserializer<'de>>(d: D) -> Result<Option<BetaWelcome>, D::Error> {
    let value = serde_json::Value::deserialize(d)?;
    Ok(serde_json::from_value::<BetaWelcome>(value)
        .ok()
        .filter(|w| {
            uuid::Uuid::parse_str(&w.id).is_ok() && w.months.is_none_or(|m| (1..=36).contains(&m))
        }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn optional_welcome_is_backward_compatible_and_fails_closed() {
        for value in [
            serde_json::Value::Null,
            json!({"id":"bad", "months":1}),
            json!({"id":"00000000-0000-4000-8000-000000000001","months":0}),
            json!(true),
        ] {
            let license: AccountLicense = serde_json::from_value(json!({
                "tokens":300,"allowance":"once","endsAt":"2999-01-01T00:00:00Z","betaWelcome":value
            }))
            .unwrap();
            assert!(license.beta_welcome.is_none());
            assert_eq!(license.tokens, 300);
        }
        let license: AccountLicense = serde_json::from_value(json!({
            "tokens":300,"allowance":"once","endsAt":"2999-01-01T00:00:00Z",
            "betaWelcome":{"id":"00000000-0000-4000-8000-000000000001","months":null}
        }))
        .unwrap();
        assert!(license.beta_welcome.is_some());
    }
}
