use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::account_api::{error_detail, request, request_raw, ApiError, Endpoint};
use crate::account_device;
use crate::account_oauth_start::request_start;
use crate::account_types::{profile_from_user, AccountSnapshot, AccountStatus};
use crate::secret_store::SecretStore;
use crate::state::AppState;

const POLL_INTERVAL: Duration = Duration::from_secs(1);
const DEFAULT_EXPIRY_SECS: u64 = 600;
const EXPIRED_MESSAGE: &str = "This sign-in attempt expired. Try again.";

/// Starts a Google or Apple browser sign-in: asks the backend for an
/// authorization URL, opens it in the system browser, and polls the one-time
/// status endpoint in the background. The URL and flow id stay native-side.
pub async fn start(app: AppHandle, provider: String) -> AccountSnapshot {
    let state = app.state::<AppState>();
    let account = &state.account;
    account.begin_authorizing(Some(provider.clone()));
    let cancel = account.begin_oauth();
    let body = serde_json::json!({
        "deviceName": account_device::device_label(),
        "installId": account_device::installation_id(),
    });
    let started = request_start(&provider, body).await;
    if cancel.load(Ordering::SeqCst) {
        return account.snapshot();
    }
    let (flow_id, auth_url, expires_in) = match started.map(parse_start) {
        Ok(Some(parts)) => parts,
        Ok(None) => {
            account.finish_oauth(&cancel);
            return fail(
                account,
                "The account service returned an unexpected response.",
            );
        }
        Err(error) => {
            account.finish_oauth(&cancel);
            return fail(account, error.message());
        }
    };
    if let Err(error) = crate::provider_auth_url::open(&auth_url) {
        account.finish_oauth(&cancel);
        eprintln!("Vibyra could not open the sign-in page: {error}");
        return fail(account, "Vibyra could not open your browser. Try again.");
    }
    let poller = app.clone();
    tauri::async_runtime::spawn(async move {
        poll_until_done(poller, provider, flow_id, expires_in, cancel).await;
    });
    account.snapshot()
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
        .unwrap_or(DEFAULT_EXPIRY_SECS)
        .clamp(30, 3600);
    Some((flow_id, auth_url, expires_in))
}

async fn poll_until_done(
    app: AppHandle,
    provider: String,
    flow_id: String,
    expires_in: u64,
    cancel: Arc<AtomicBool>,
) {
    let deadline = std::time::Instant::now() + Duration::from_secs(expires_in + 30);
    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        if cancel.load(Ordering::SeqCst) {
            return;
        }
        if std::time::Instant::now() >= deadline {
            finish(&app, &cancel, Err(EXPIRED_MESSAGE.to_owned())).await;
            return;
        }
        match request_raw(Endpoint::OauthStatus(&provider, &flow_id), None, None).await {
            Ok((status, body)) => {
                let flow_status = body.get("status").and_then(|v| v.as_str()).unwrap_or("");
                match (status, flow_status) {
                    (200, "pending") => continue,
                    (200, "complete") => {
                        let outcome = verify_completed(&app, body, &cancel).await;
                        finish(&app, &cancel, outcome).await;
                        return;
                    }
                    (code, _) if retryable_status(code) => continue,
                    (410, _) => {
                        finish(&app, &cancel, Err(EXPIRED_MESSAGE.to_owned())).await;
                        return;
                    }
                    (code, _) => {
                        finish(&app, &cancel, Err(error_detail(&body, code))).await;
                        return;
                    }
                }
            }
            // Transient network trouble: the one-time result stays waiting on
            // the backend, so keep polling until the deadline.
            Err(_) => continue,
        }
    }
}

fn retryable_status(status: u16) -> bool {
    status == 429 || (500..=599).contains(&status)
}

/// Consumes the one-time completion payload: verifies the returned session
/// against /api/session before persisting it.
async fn verify_completed(
    app: &AppHandle,
    body: serde_json::Value,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    let token = body
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "The account service returned an unexpected response.".to_owned())?;
    // The status response is one-shot. Keep its token in native memory while a
    // temporary backend outage clears, instead of discarding a completed login.
    let deadline = std::time::Instant::now() + Duration::from_secs(90);
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("Sign-in cancelled.".into());
        }
        match request(Endpoint::Session, Some(token), None).await {
            Ok(session) => {
                let profile =
                    profile_from_user(session.get("user").unwrap_or(&serde_json::Value::Null))
                        .ok_or_else(|| {
                            "The account service returned an unexpected response.".to_owned()
                        })?;
                let state = app.state::<AppState>();
                if cancel.load(Ordering::SeqCst) {
                    return Err("Sign-in cancelled.".into());
                }
                state
                    .account
                    .adopt_session(&SecretStore, token.to_owned(), profile);
                return Ok(());
            }
            Err(ApiError::Unauthorized(message)) => return Err(message),
            Err(ApiError::Network(_)) if std::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
            Err(error) => return Err(error.message().to_owned()),
        }
    }
}

async fn finish(app: &AppHandle, cancel: &Arc<AtomicBool>, outcome: Result<(), String>) {
    let state = app.state::<AppState>();
    let account = &state.account;
    account.finish_oauth(cancel);
    if cancel.load(Ordering::SeqCst) {
        return;
    }
    if let Err(message) = outcome {
        account.set_status(AccountStatus::SignedOut, Some(message));
    }
    let _ = app.emit("account:changed", account.snapshot());
}

fn fail(account: &crate::account_session::AccountSessionManager, message: &str) -> AccountSnapshot {
    account.set_status(AccountStatus::SignedOut, Some(message.to_owned()));
    account.snapshot()
}

#[cfg(test)]
mod tests {
    use super::retryable_status;

    #[test]
    fn oauth_poll_keeps_waiting_during_temporary_service_failures() {
        assert!(retryable_status(429));
        assert!(retryable_status(503));
        assert!(!retryable_status(401));
        assert!(!retryable_status(410));
    }
}
