use crate::account_api::{request, ApiError, Endpoint};
use crate::account_types::{
    profile_from_user, verified_preview_account_id, AccountSnapshot, AccountStatus,
};
use crate::secret_store::SecretStore;
use crate::state::AppState;
/// Restores and verifies a saved session. A stored credential is discarded
/// only on an authoritative 401/403; network trouble preserves it and
/// reports a retryable connection error instead.
pub async fn restore(state: &AppState) -> AccountSnapshot {
    let account = &state.account;
    let Some(epoch) = account.begin_restore(|| bind_preview_account(state, None)) else {
        return account.snapshot();
    };
    let store = SecretStore;
    let token = match store.read_account_session() {
        Ok(Some(token)) => token,
        Ok(None) => {
            account.status_for_attempt(epoch, AccountStatus::SignedOut, None);
            return account.snapshot();
        }
        Err(error) => {
            eprintln!("Vibyra account restore skipped: {error}");
            account.storage_failed_for_attempt(epoch);
            account.status_for_attempt(epoch, AccountStatus::SignedOut, None);
            return account.snapshot();
        }
    };
    match request(Endpoint::Session, Some(&token), None).await {
        Ok(body) => match profile_from_user(body.get("user").unwrap_or(&serde_json::Value::Null)) {
            Some(profile) => {
                if account.adopt_for_attempt(epoch, token.clone(), profile, || {
                    bind_preview_account(state, body.get("user"));
                    state.phone.lock().account_signed_in();
                }) {
                    rotate_session(state, token).await;
                }
            }
            None => {
                account.status_for_attempt(
                    epoch,
                    AccountStatus::ConnectionError,
                    Some("The account service returned an unexpected response.".into()),
                );
            }
        },
        Err(ApiError::Unauthorized(_)) => {
            account.reject_attempt(epoch, || cleanup(state));
        }
        Err(error) => {
            account.status_for_attempt(
                epoch,
                AccountStatus::ConnectionError,
                Some(error.message().into()),
            );
        }
    }
    account.snapshot()
}
/// Rotates the bearer token after a verified restore. Skipped when the OS
/// credential store is unavailable — rotating would strand the persisted
/// token once the grace window closes. A 409 means another install rotated
/// first; the current token is kept.
async fn rotate_session(state: &AppState, token: String) {
    let account = &state.account;
    if !account.snapshot().secure_storage {
        return;
    }
    if account.token().as_deref() != Some(&token) {
        return;
    }
    match request(Endpoint::Rotate, Some(&token), None).await {
        Ok(body) => {
            if let Some(fresh) = body.get("token").and_then(|v| v.as_str()) {
                account.replace_for_token(&token, fresh.to_owned());
            }
        }
        Err(ApiError::Rejected(_)) | Err(ApiError::Network(_)) => {}
        Err(ApiError::Unauthorized(_)) => {
            teardown_for_token(state, &token);
        }
    }
}
/// Clears local access atomically, then revokes only the captured backend session.
pub async fn logout(state: &AppState) -> AccountSnapshot {
    let account = &state.account;
    if let Some(token) = account.logout_local(|| cleanup(state)) {
        if let Err(error) = request(Endpoint::Logout, Some(&token), None).await {
            eprintln!("Vibyra logout revocation skipped: {}", error.message());
        }
    }
    account.snapshot()
}
/// Atomically ends only the captured session and its local terminal/remote access.
pub(crate) fn teardown_for_token(state: &AppState, token: &str) -> bool {
    state.account.reject_for_token(token, || cleanup(state))
}

fn cleanup(state: &AppState) {
    if let Err(error) = state.cloud_management.revoke() {
        eprintln!("Cloud management approval revocation failed: {error}");
    }
    crate::agent_v2::stop();
    stop_account_audio(state);
    state.phone.lock().account_signed_out();
    clear_preview_grants(state);
    for id in state.manager.close_all() {
        state.sink.detach(id);
    }
}

pub fn bind_preview_account(state: &AppState, user: Option<&serde_json::Value>) {
    stop_account_audio(state);
    let scope = user.and_then(verified_preview_account_id);
    if let Ok(grants) = &state.preview_grants {
        if let Err(error) = grants.set_account(scope.as_deref()) {
            eprintln!("Vibyra Preview account binding failed: {error}");
        }
    }
}

fn clear_preview_grants(state: &AppState) {
    if let Ok(grants) = &state.preview_grants {
        if let Err(error) = grants.revoke_all() {
            eprintln!("Vibyra Preview grants could not be persisted as revoked: {error}");
        }
    }
}

// Auth transitions hold account authority before audio locks; neither audio
// resource may re-enter AccountSessionManager while being stopped.
fn stop_account_audio(state: &AppState) {
    drop(state.voice.lock().take());
    crate::commands::speech::shutdown();
}
