use std::sync::atomic::Ordering;
use std::time::Duration;

use crate::account_api::{error_detail, request, request_raw, ApiError, Endpoint};
use crate::account_auth;
use crate::account_device;
use crate::state::AppState;

const POLL_INTERVAL: Duration = Duration::from_secs(1);
const EXPIRED: &str = "That confirmation expired. Start again when you are ready.";
const CANCELLED: &str = "Deletion cancelled. Your account is untouched.";

/// Deletes an email account, proved by its password. On success the local
/// session is torn down exactly as a logout would tear it down.
pub async fn with_password(state: &AppState, password: String) -> Result<(), String> {
    let Some(token) = state.account.token() else {
        return Err("You are not signed in.".to_owned());
    };
    let body = serde_json::json!({ "password": password });
    match request(Endpoint::DeleteAccount, Some(&token), Some(body)).await {
        Ok(_) => {
            account_auth::teardown(state);
            Ok(())
        }
        // A wrong password answers 401 here, which must not be read as an
        // expired session: the account is still signed in and still exists.
        Err(ApiError::Unauthorized(message)) | Err(ApiError::Rejected(message)) => Err(message),
        Err(error) => Err(error.message().to_owned()),
    }
}

/// Deletes an Apple or Google account by signing in with that provider once
/// more, in the system browser, where the sign-in's only effect is deletion.
/// Resolves when the provider has confirmed, the attempt expired, or the
/// person cancelled from Settings.
pub async fn with_provider(state: &AppState, provider: String) -> Result<(), String> {
    let Some(token) = state.account.token() else {
        return Err("You are not signed in.".to_owned());
    };
    let body = serde_json::json!({
        "purpose": "deletion",
        "deviceName": account_device::device_label(),
        "installId": account_device::installation_id(),
    });
    let started = request(Endpoint::OauthStart(&provider), Some(&token), Some(body)).await;
    let (flow_id, auth_url, expires_in) = match started.map(parse_start) {
        Ok(Some(parts)) => parts,
        Ok(None) => return Err("The account service returned an unexpected response.".to_owned()),
        Err(error) => return Err(error.message().to_owned()),
    };
    crate::provider_auth_url::open(&auth_url)
        .map_err(|_| "Vibyra could not open your browser. Try again.".to_owned())?;
    let cancel = state.account.delete_cancel.begin();
    let deadline = std::time::Instant::now() + Duration::from_secs(expires_in + 30);
    let outcome = loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        if cancel.load(Ordering::SeqCst) {
            // The provider's page never sends the browser back, so someone who
            // closes it the moment it says deleted can beat the next poll. One
            // more look settles which of the two happened.
            break match check(&provider, &flow_id).await {
                Some(Ok(())) => Ok(()),
                _ => Err(CANCELLED.to_owned()),
            };
        }
        if std::time::Instant::now() >= deadline {
            break Err(EXPIRED.to_owned());
        }
        if let Some(result) = check(&provider, &flow_id).await {
            break result;
        }
    };
    state.account.delete_cancel.finish(&cancel);
    if outcome.is_ok() {
        account_auth::teardown(state);
    }
    outcome
}

pub fn cancel(state: &AppState) {
    state.account.delete_cancel.cancel();
}

/// One look at the one-time flow: `None` while it is still pending or the
/// network is briefly unreachable, so the caller keeps waiting.
async fn check(provider: &str, flow_id: &str) -> Option<Result<(), String>> {
    let (status, body) = request_raw(Endpoint::OauthStatus(provider, flow_id), None, None)
        .await
        .ok()?;
    let flow_status = body.get("status").and_then(|v| v.as_str()).unwrap_or("");
    let deleted = body
        .get("deleted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    match (status, flow_status, deleted) {
        (200, "pending", _) => None,
        (200, "complete", true) => Some(Ok(())),
        (410, _, _) => Some(Err(EXPIRED.to_owned())),
        (200, "complete", false) => Some(Err(
            "That sign-in did not confirm the deletion. Try again.".to_owned(),
        )),
        (code, _, _) => Some(Err(error_detail(&body, code))),
    }
}

fn parse_start(body: serde_json::Value) -> Option<(String, String, u64)> {
    let flow_id = body.get("flowId")?.as_str()?.to_owned();
    let auth_url = body.get("authUrl")?.as_str()?.to_owned();
    if !auth_url.starts_with("https://") {
        return None;
    }
    let expires_in = body
        .get("expiresIn")
        .and_then(|v| v.as_u64())
        .unwrap_or(600)
        .clamp(30, 3600);
    Some((flow_id, auth_url, expires_in))
}
