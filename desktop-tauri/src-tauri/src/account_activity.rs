//! The account's own activity log, read only. The renderer asks for a page by number; the route is fixed in
//! `Endpoint::AccountActivity` and nothing the backend returns beyond the named fields reaches the screen.
use serde_json::{json, Value};

use super::session::BillingSession;
use crate::account_api::Endpoint;
use crate::state::AppState;

/// One page, newest first: `{ items, next }`, or `null` when the server does not offer the log
/// (an older server, or the flag off), which the Settings list reads as "draw nothing".
pub async fn page(state: &AppState, before: u64) -> Result<Value, String> {
    let action = BillingSession::capture(&state.account)?;
    let Some(body) = action
        .optional_read(Endpoint::AccountActivity(before))
        .await?
    else {
        return Ok(Value::Null);
    };
    Ok(shape(&body))
}

fn shape(body: &Value) -> Value {
    let items: Vec<Value> = body
        .get("items")
        .and_then(Value::as_array)
        .map(|rows| rows.iter().filter_map(item).collect())
        .unwrap_or_default();
    json!({ "items": items, "next": body.get("next").and_then(Value::as_u64) })
}

fn item(row: &Value) -> Option<Value> {
    let text = |key: &str, max: usize| {
        row.get(key)
            .and_then(Value::as_str)
            .map(|s| s.chars().take(max).collect::<String>())
    };
    let detail: Vec<String> = row
        .get("detail")
        .and_then(Value::as_object)
        .map(|d| {
            d.iter()
                .filter_map(|(k, v)| {
                    let v = match v {
                        Value::String(s) => s.chars().take(120).collect::<String>(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        _ => return None,
                    };
                    Some(format!("{k}: {v}"))
                })
                .take(8)
                .collect()
        })
        .unwrap_or_default();
    Some(json!({
        "id": row.get("id").and_then(Value::as_u64)?,
        "title": text("title", 120)?,
        "createdAt": text("createdAt", 40)?,
        "detail": detail.join(" · "),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_page_keeps_only_the_named_fields_bounded() {
        let body = json!({ "ok": true, "next": 7, "token": "secret", "items": [
            { "id": 9, "title": "Signed in", "createdAt": "2026-10-02T10:00:00+00:00", "actor": "account", "ipAddress": "1.2.3.4",
              "detail": { "channel": "app", "count": 2, "nested": { "x": 1 } } },
            { "title": "No id is dropped" } ] });
        let page = shape(&body);
        assert_eq!(page["next"], 7);
        assert_eq!(page["items"].as_array().unwrap().len(), 1);
        assert_eq!(page["items"][0]["detail"], "channel: app · count: 2");
        assert!(page["items"][0].get("ipAddress").is_none());
        assert!(page.get("token").is_none());
    }
}
