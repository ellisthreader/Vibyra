use std::sync::atomic::Ordering;
use std::time::Duration;

use crate::account_api::{error_detail, request, request_raw_with_flow_secret, ApiError, Endpoint};
use crate::account_auth;
use crate::account_device;
use crate::state::AppState;

const POLL_INTERVAL: Duration = Duration::from_secs(1);
const EXPIRED: &str = "That confirmation expired. Start again when you are ready.";
const CANCELLED: &str = "Confirmation cancelled. Refresh your account to check its status.";

/// Deletes an email account, proved by its password. On success the local
/// session is torn down exactly as a logout would tear it down.
pub async fn with_password(state: &AppState, password: String) -> Result<(), String> {
    let Some(token) = state.account.token() else {
        return Err("You are not signed in.".to_owned());
    };
    let body = serde_json::json!({ "password": password });
    match request(Endpoint::DeleteAccount, Some(&token), Some(body)).await {
        Ok(_) => {
            if account_auth::teardown_for_token(state, &token) {
                Ok(())
            } else {
                Err("Your account changed. Refresh Settings.".into())
            }
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
    let cancel = state.account.delete_cancel.begin();
    let outcome = provider_flow(state, &token, &provider, &cancel).await;
    state.account.delete_cancel.finish(&cancel);
    if outcome.is_ok() && !account_auth::teardown_for_token(state, &token) {
        return Err("Your account changed. Refresh Settings.".into());
    }
    outcome
}

fn active(
    account: &crate::account_session::AccountSessionManager,
    token: &str,
    cancel: &std::sync::atomic::AtomicBool,
) -> Result<(), String> {
    account.with_token(token, || {
        if cancel.load(Ordering::SeqCst) {
            Err(CANCELLED.to_owned())
        } else {
            Ok(())
        }
    })?
}

async fn provider_flow(
    state: &AppState,
    token: &str,
    provider: &str,
    cancel: &std::sync::atomic::AtomicBool,
) -> Result<(), String> {
    let (flow_secret, mut body) = crate::account_oauth_start::start_body(
        &account_device::device_label(),
        &account_device::installation_id(),
    )?;
    body["purpose"] = serde_json::json!("deletion");
    active(&state.account, token, cancel)?;
    let started = request(Endpoint::OauthStart(provider), Some(token), Some(body)).await;
    active(&state.account, token, cancel)?;
    let (flow_id, auth_url, expires_in) = match started.map(parse_start) {
        Ok(Some(parts)) => parts,
        Ok(None) => return Err("The account service returned an unexpected response.".to_owned()),
        Err(error) => return Err(error.message().to_owned()),
    };
    state.account.with_token(token, || {
        if cancel.load(Ordering::SeqCst) {
            return Err(CANCELLED.to_owned());
        }
        crate::provider_auth_url::open(&auth_url)
            .map_err(|_| "Vibyra could not open your browser. Try again.".to_owned())
    })??;
    let deadline = std::time::Instant::now() + Duration::from_secs(expires_in + 30);
    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        active(&state.account, token, cancel)?;
        if std::time::Instant::now() >= deadline {
            return Err(EXPIRED.to_owned());
        }
        let result = check(provider, &flow_id, &flow_secret).await;
        active(&state.account, token, cancel)?;
        if let Some(result) = result {
            return result;
        }
    }
}

pub fn cancel(state: &AppState) {
    state.account.delete_cancel.cancel();
}

/// One look at the one-time flow: `None` while it is still pending or the
/// network is briefly unreachable, so the caller keeps waiting.
async fn check(provider: &str, flow_id: &str, flow_secret: &str) -> Option<Result<(), String>> {
    let (status, body) = request_raw_with_flow_secret(
        Endpoint::OauthStatus(provider, flow_id),
        None,
        None,
        Some(flow_secret),
    )
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_flow_checks_session_and_attempt_before_releasing_result() {
        let account = crate::account_session::AccountSessionManager::default();
        account.set_test_session("A", crate::account_types::AccountProfile::default());
        let first = account.delete_cancel.begin();
        assert!(active(&account, "A", &first).is_ok());
        let second = account.delete_cancel.begin();
        assert!(active(&account, "A", &first).is_err());
        assert!(active(&account, "A", &second).is_ok());
        account.set_test_session("B", crate::account_types::AccountProfile::default());
        assert!(active(&account, "A", &second).is_err());
        account.delete_cancel.cancel();
        assert!(active(&account, "B", &second).is_err());
        assert_eq!(account.token().as_deref(), Some("B"));
    }
}
