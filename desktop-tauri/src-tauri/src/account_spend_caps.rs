//! A person's own spending limits (daily, monthly, per task), kept on the account.
//! The renderer names an action; the path, method and body shape are fixed here, so it
//! can neither reach another route nor send a field the backend does not define.
use serde_json::{json, Map, Value};

use super::session::BillingSession;
use crate::account_api::Endpoint;
use crate::state::AppState;

/// What the backend reports, or `null` when it does not offer limits (an older server, or
/// the flag off), which the Settings card reads as "draw nothing".
pub async fn read(state: &AppState) -> Result<Value, String> {
    let action = BillingSession::capture(&state.account)?;
    match action.request(Endpoint::SpendCaps, None).await {
        Ok(body) => Ok(report(&body)),
        Err(message) if message.to_lowercase().contains("found") => Ok(Value::Null),
        Err(message) => Err(message),
    }
}

pub async fn write(state: &AppState, change: Value) -> Result<Value, String> {
    let change = checked(&change)?;
    let action = BillingSession::capture(&state.account)?;
    let body = action.request(Endpoint::SpendCapsSet, Some(change)).await?;
    Ok(report(&body))
}

pub async fn raise(state: &AppState, cap: &str, tokens: Option<f64>) -> Result<Value, String> {
    if !matches!(cap, "day" | "month") {
        return Err("Choose the daily or monthly limit.".to_owned());
    }
    let mut body = json!({ "cap": cap });
    if let Some(tokens) = tokens.filter(|t| t.is_finite() && *t >= 1.0 && *t <= 100_000.0) {
        body["tokens"] = json!(tokens);
    }
    let action = BillingSession::capture(&state.account)?;
    Ok(report(
        &action.request(Endpoint::SpendCapsRaise, Some(body)).await?,
    ))
}

fn report(body: &Value) -> Value {
    body.get("spendCaps")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or(Value::Null)
}

/// Only the fields the backend defines, each of the right type. Anything else is refused.
fn checked(change: &Value) -> Result<Value, String> {
    let fields = change.as_object().ok_or("That limit could not be saved.")?;
    let mut out = Map::new();
    for (key, value) in fields {
        let ok = match key.as_str() {
            "day" | "month" | "run" => {
                value.is_null()
                    || value
                        .as_f64()
                        .is_some_and(|n| n.is_finite() && (1.0..=100_000.0).contains(&n))
            }
            "alerts" => value.is_boolean(),
            "cloudIncludedHours" => {
                value.is_null() || matches!(value.as_str(), Some("tokens" | "stop"))
            }
            "timezone" => value
                .as_str()
                .is_some_and(|z| !z.is_empty() && z.len() <= 64),
            _ => false,
        };
        if !ok {
            return Err("That limit could not be saved.".to_owned());
        }
        out.insert(key.clone(), value.clone());
    }
    Ok(Value::Object(out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_defined_fields_of_the_right_type_are_sent() {
        let ok = json!({ "day": 25, "month": null, "run": 5.5, "alerts": false, "cloudIncludedHours": "stop", "timezone": "Europe/London" });
        assert_eq!(checked(&ok).unwrap(), ok);
        for bad in [
            json!({ "day": 0 }),
            json!({ "month": "lots" }),
            json!({ "run": 100_001 }),
            json!({ "alerts": "yes" }),
            json!({ "cloudIncludedHours": "forever" }),
            json!({ "path": "/api/account" }),
            json!([1]),
        ] {
            assert!(checked(&bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn only_the_spend_caps_object_is_passed_on() {
        assert_eq!(
            report(&json!({ "spendCaps": { "enabled": false } })),
            json!({ "enabled": false })
        );
        assert_eq!(report(&json!({ "wallet": {} })), Value::Null);
    }
}
