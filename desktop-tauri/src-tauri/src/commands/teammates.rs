use crate::{account_api, state::AppState};
use serde_json::Value;
use tauri::State;

fn permitted(path: &str, write: bool) -> bool {
    let parts: Vec<_> = path.split('/').collect();
    let uuid = |value: &str| {
        value.len() == 36
            && value.bytes().enumerate().all(|(i, b)| {
                if [8, 13, 18, 23].contains(&i) {
                    b == b'-'
                } else {
                    b.is_ascii_hexdigit()
                }
            })
    };
    match parts.as_slice() {
        ["agents", "v1", "teammates" | "skills"] => true,
        ["agents", "v1", "teammates", id] => write && uuid(id),
        ["agents", "v1", "teammates", id, "archive" | "read"] => write && uuid(id),
        ["agents", "v1", "teammates", id, "chats"] => !write && uuid(id),
        ["agents", "v1", "decisions", id] => write && uuid(id),
        ["vibes", "wallet" | "models"] => !write,
        ["vibes", "quote" | "turns" | "consent"] => write,
        ["vibes", "turns", id] => !write && uuid(id),
        ["vibes", "turns", id, "cancel"] => write && uuid(id),
        ["vibes", "chats", id, "turns"] => !write && uuid(id),
        ["connectors"] => !write,
        ["connectors", "flows", id] => !write && uuid(id),
        ["connectors", slug, "start" | "disconnect"] => {
            write
                && !slug.is_empty()
                && slug.len() <= 64
                && slug
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        }
        _ => false,
    }
}

/// Account-scoped API bridge. No caller-selected origin, credentials or automatic write retries.
#[tauri::command]
pub async fn teammate_request(
    state: State<'_, AppState>,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
    if !permitted(&path, body.is_some()) {
        return Err("Unsupported teammate operation.".into());
    }
    if body.as_ref().is_some_and(|v| v.to_string().len() > 100_000) {
        return Err("This request is too large.".into());
    }
    let token = state.account.token().ok_or("Sign in to use teammates.")?;
    let method = if body.is_some() {
        reqwest::Method::POST
    } else {
        reqwest::Method::GET
    };
    let mut request = reqwest::Client::new()
        .request(method, format!("{}/api/{}", account_api::base_url(), path))
        .bearer_auth(&token)
        .header("Accept", "application/json")
        .timeout(std::time::Duration::from_secs(30));
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Connection interrupted. Refresh to check the outcome.".to_string())?;
    let status = response.status().as_u16();
    let mut value: Value = response
        .json()
        .await
        .map_err(|_| "The service returned an unreadable response.".to_string())?;
    if state.account.token().as_deref() != Some(token.as_str()) {
        return Err("Your account changed. Refresh to continue.".into());
    }
    if !(200..300).contains(&status) {
        return Err(format!(
            "{}: {}",
            status,
            account_api::error_detail(&value, status)
        ));
    }
    if let Some(wallet) = value.get_mut("wallet").and_then(Value::as_object_mut) {
        wallet.remove("accountToken");
    }
    if path.starts_with("connectors/") && path.ends_with("/start") {
        crate::provider_auth_url::open(value["url"].as_str().ok_or("Missing sign-in address.")?)?;
        if let Some(object) = value.as_object_mut() {
            object.remove("url");
        }
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::permitted;
    #[test]
    fn paths_are_method_scoped_and_cannot_escape_the_api() {
        assert!(permitted("agents/v1/teammates", false));
        assert!(permitted(
            "vibes/turns/123e4567-e89b-12d3-a456-426614174000",
            false
        ));
        for path in [
            "https://other.test",
            "agents/v1/teammates/../auth",
            "vibes/wallet?token=x",
            "vibes/purchases",
        ] {
            assert!(!permitted(path, true));
            assert!(!permitted(path, false));
        }
        assert!(!permitted("vibes/consent", false));
        assert!(!permitted("vibes/models", true));
    }
}
