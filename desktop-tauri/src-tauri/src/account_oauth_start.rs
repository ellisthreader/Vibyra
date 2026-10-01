use std::time::Duration;

use crate::account_api::{request, ApiError, Endpoint};

pub(crate) fn start_body(
    device_name: &str,
    install_id: &str,
) -> Result<(String, serde_json::Value), &'static str> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "Secure sign-in could not start. Please try again.")?;
    let secret: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    let body = serde_json::json!({
        "deviceName": device_name,
        "installId": install_id,
        "flowSecret": secret,
    });
    Ok((secret, body))
}

/// Starting a flow only stores short-lived backend state, so retrying a
/// temporary service failure cannot accidentally sign in twice.
pub(crate) async fn request_start(
    provider: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, ApiError> {
    for attempt in 0..3 {
        match request(Endpoint::OauthStart(provider), None, Some(body.clone())).await {
            Err(ApiError::Network(_)) if attempt < 2 => {
                tokio::time::sleep(Duration::from_secs(2)).await
            }
            outcome => return outcome,
        }
    }
    unreachable!("the final OAuth start attempt returns its outcome")
}

const DEFAULT_EXPIRY_SECS: u64 = 600;

pub(crate) fn parse_start(body: serde_json::Value) -> Option<(String, String, u64)> {
    let flow_id = body.get("flowId")?.as_str()?.to_owned();
    let auth_url = body.get("authUrl")?.as_str()?.to_owned();
    if !auth_url.starts_with("https://") {
        return None;
    }
    let expires_in = body
        .get("expiresIn")
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_EXPIRY_SECS)
        .clamp(30, 3600);
    Some((flow_id, auth_url, expires_in))
}
