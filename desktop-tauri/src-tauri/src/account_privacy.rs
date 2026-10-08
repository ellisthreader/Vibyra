//! "Download my data" and "Keep run history for" (roadmap Part 19). The renderer names an action; the routes, methods
//! and body shape are fixed in `Endpoint`, only the named fields come back, and the signed download link never reaches
//! the renderer: native fetches it fresh and opens it in the browser, after checking it points at this account API.
use serde_json::{json, Value};

use super::session::BillingSession;
use crate::account_api::{base_url, Endpoint};
use crate::state::AppState;

const STATUSES: [&str; 6] = ["none", "queued", "building", "ready", "failed", "expired"];

pub async fn export_status(state: &AppState, request: bool) -> Result<Value, String> {
    let action = BillingSession::capture(&state.account)?;
    let body = if request {
        Some(
            action
                .request(Endpoint::AccountExportRequest, Some(json!({})))
                .await?,
        )
    } else {
        action.optional_read(Endpoint::AccountExport).await?
    };
    Ok(body.map_or(Value::Null, |body| export_shape(&body)))
}

/// Mints a fresh link, checks it, and opens it. The link is never returned.
pub async fn export_open(state: &AppState) -> Result<(), String> {
    let action = BillingSession::capture(&state.account)?;
    let body = action.request(Endpoint::AccountExport, None).await?;
    let link = body
        .get("link")
        .and_then(Value::as_str)
        .ok_or("Your download is not ready.")?;
    if !link.starts_with(&format!("{}/account-export/", base_url())) {
        return Err("The download link was not recognised.".to_owned());
    }
    action.perform(|| {
        crate::provider_auth_url::open(link)
            .map_err(|_| "Vibyra could not open your browser. Try again.".to_owned())
    })
}

fn export_shape(body: &Value) -> Value {
    let text = |key: &str| {
        body.get(key)
            .and_then(Value::as_str)
            .map(|s| s.chars().take(40).collect::<String>())
    };
    let status = text("status")
        .filter(|s| STATUSES.contains(&s.as_str()))
        .unwrap_or_else(|| "none".to_owned());
    json!({
        "status": status,
        "canRequest": body.get("canRequest").and_then(Value::as_bool).unwrap_or(false),
        "nextAllowedAt": text("nextAllowedAt"),
        "hasLink": body.get("link").and_then(Value::as_str).is_some(),
        "linkExpiresInMinutes": body.get("linkExpiresInMinutes").and_then(Value::as_u64),
        "bytes": body.get("bytes").and_then(Value::as_u64),
    })
}

pub async fn retention(state: &AppState, days: Option<Option<u32>>) -> Result<Value, String> {
    let action = BillingSession::capture(&state.account)?;
    let result = match days {
        None => action.optional_read(Endpoint::AccountRetention).await?,
        Some(days) => Some(
            action
                .request(Endpoint::AccountRetentionSet, Some(json!({ "days": days })))
                .await?,
        ),
    };
    Ok(result.map_or(Value::Null, |body| retention_shape(&body)))
}

fn retention_shape(body: &Value) -> Value {
    let days = |key: &str| body.get(key).and_then(Value::as_u64);
    let choices: Vec<u64> = body
        .get("choices")
        .and_then(Value::as_array)
        .map(|rows| rows.iter().filter_map(Value::as_u64).take(12).collect())
        .unwrap_or_default();
    json!({ "maxDays": days("maxDays"), "serverDays": days("serverDays"), "days": days("days"), "choices": choices })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_export_keeps_only_the_named_fields_and_never_the_link() {
        let body = json!({ "ok": true, "status": "ready", "canRequest": false, "token": "secret", "bytes": 2048, "linkExpiresInMinutes": 15,
            "link": "https://example.test/account-export/x?signature=abc", "nextAllowedAt": "2026-10-03T10:00:00+00:00" });
        let shaped = export_shape(&body);
        assert_eq!(shaped["status"], "ready");
        assert_eq!(shaped["hasLink"], true);
        assert!(shaped.get("link").is_none() && shaped.get("token").is_none());
        assert_eq!(
            export_shape(&json!({ "status": "<script>" }))["status"],
            "none"
        );
    }

    #[test]
    fn retention_is_bounded_numbers_only() {
        let body = json!({ "maxDays": 90, "serverDays": 90, "days": 30, "choices": [7, 30, 90, "x"], "extra": "no" });
        assert_eq!(
            retention_shape(&body),
            json!({ "maxDays": 90, "serverDays": 90, "days": 30, "choices": [7, 30, 90] })
        );
    }
}
