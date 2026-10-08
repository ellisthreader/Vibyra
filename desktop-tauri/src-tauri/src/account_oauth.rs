use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::account_api::{error_detail, request_raw_with_flow_secret, Endpoint};
use crate::account_auth::bind_preview_account;
use crate::account_device;
use crate::account_oauth_start::{parse_start, request_start, start_body};
use crate::account_types::{AccountSnapshot, AccountStatus};
use crate::state::AppState;

#[path = "account_oauth_complete.rs"]
mod complete;
use complete::verify_completed;

const POLL_INTERVAL: Duration = Duration::from_secs(1);
const EXPIRED_MESSAGE: &str = "This sign-in attempt expired. Try again.";

/// Starts a Google or Apple browser sign-in: asks the backend for an
/// authorization URL, opens it in the system browser, and polls the one-time
/// status endpoint in the background. The URL and flow id stay native-side.
pub async fn start(
    app: AppHandle,
    provider: String,
    signup: Option<crate::account_signup::AccountSignupDeclarations>,
) -> AccountSnapshot {
    let state = app.state::<AppState>();
    let account = &state.account;
    let (epoch, cancel) =
        account.begin_oauth_attempt(provider.clone(), || bind_preview_account(&state, None));
    let (flow_secret, mut body) = match start_body(
        &account_device::device_label(),
        &account_device::installation_id(),
    ) {
        Ok(parts) => parts,
        Err(message) => {
            account.finish_oauth(&cancel);
            return fail(account, epoch, message);
        }
    };
    if let Some(signup) = signup {
        if let Err(message) = signup.add_to(&mut body) {
            account.finish_oauth(&cancel);
            return fail(account, epoch, message);
        }
    }
    let started = request_start(&provider, body).await;
    if cancel.load(Ordering::SeqCst) || !account.attempt_current(epoch) {
        return account.snapshot();
    }
    let (flow_id, auth_url, expires_in) = match started.map(parse_start) {
        Ok(Some(parts)) => parts,
        Ok(None) => {
            account.finish_oauth(&cancel);
            return fail(
                account,
                epoch,
                "The account service returned an unexpected response.",
            );
        }
        Err(error) => {
            account.finish_oauth(&cancel);
            return fail(account, epoch, error.message());
        }
    };
    let Some(opened) = account.with_attempt(epoch, || crate::provider_auth_url::open(&auth_url))
    else {
        return account.snapshot();
    };
    if let Err(error) = opened {
        account.finish_oauth(&cancel);
        eprintln!("Vibyra could not open the sign-in page: {error}");
        return fail(
            account,
            epoch,
            "Vibyra could not open your browser. Try again.",
        );
    }
    let poller = app.clone();
    tauri::async_runtime::spawn(async move {
        poll_until_done(
            poller,
            provider,
            flow_id,
            flow_secret,
            expires_in,
            cancel,
            epoch,
        )
        .await;
    });
    account.snapshot()
}

async fn poll_until_done(
    app: AppHandle,
    provider: String,
    flow_id: String,
    flow_secret: String,
    expires_in: u64,
    cancel: Arc<AtomicBool>,
    epoch: u64,
) {
    let deadline = std::time::Instant::now() + Duration::from_secs(expires_in + 30);
    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        if cancel.load(Ordering::SeqCst) || !app.state::<AppState>().account.attempt_current(epoch)
        {
            return;
        }
        if std::time::Instant::now() >= deadline {
            finish(&app, &cancel, epoch, Err(EXPIRED_MESSAGE.to_owned())).await;
            return;
        }
        match request_raw_with_flow_secret(
            Endpoint::OauthStatus(&provider, &flow_id),
            None,
            None,
            Some(&flow_secret),
        )
        .await
        {
            Ok((status, body)) => {
                let flow_status = body.get("status").and_then(|v| v.as_str()).unwrap_or("");
                match (status, flow_status) {
                    (200, "pending") => continue,
                    (200, "complete") => {
                        let outcome = verify_completed(&app, body, &cancel, epoch).await;
                        finish(&app, &cancel, epoch, outcome).await;
                        return;
                    }
                    (code, _) if retryable_status(code) => continue,
                    (410, _) => {
                        finish(&app, &cancel, epoch, Err(EXPIRED_MESSAGE.to_owned())).await;
                        return;
                    }
                    (code, _) => {
                        finish(&app, &cancel, epoch, Err(error_detail(&body, code))).await;
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

async fn finish(
    app: &AppHandle,
    cancel: &Arc<AtomicBool>,
    epoch: u64,
    outcome: Result<(), String>,
) {
    let state = app.state::<AppState>();
    let account = &state.account;
    account.finish_oauth(cancel);
    if cancel.load(Ordering::SeqCst) {
        return;
    }
    if let Err(message) = outcome {
        account.status_for_attempt(epoch, AccountStatus::SignedOut, Some(message));
    }
    let _ = app.emit("account:changed", account.snapshot());
}

fn fail(
    account: &crate::account_session::AccountSessionManager,
    epoch: u64,
    message: &str,
) -> AccountSnapshot {
    account.status_for_attempt(epoch, AccountStatus::SignedOut, Some(message.to_owned()));
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
