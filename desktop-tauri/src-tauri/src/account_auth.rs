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
    bind_preview_account(state, None);
    let account = &state.account;
    let store = SecretStore;
    let token = match store.read_account_session() {
        Ok(Some(token)) => token,
        Ok(None) => {
            account.set_status(AccountStatus::SignedOut, None);
            return account.snapshot();
        }
        Err(error) => {
            eprintln!("Vibyra account restore skipped: {error}");
            account.mark_secure_storage(false);
            account.set_status(AccountStatus::SignedOut, None);
            return account.snapshot();
        }
    };
    match request(Endpoint::Session, Some(&token), None).await {
        Ok(body) => match profile_from_user(body.get("user").unwrap_or(&serde_json::Value::Null)) {
            Some(profile) => {
                bind_preview_account(state, body.get("user"));
                account.adopt_session(&store, token, profile);
                rotate_session(state).await;
            }
            None => account.set_status(
                AccountStatus::ConnectionError,
                Some("The account service returned an unexpected response.".into()),
            ),
        },
        Err(ApiError::Unauthorized(_)) => teardown(state),
        Err(error) => {
            account.set_status(AccountStatus::ConnectionError, Some(error.message().into()));
        }
    }
    account.snapshot()
}
/// Rotates the bearer token after a verified restore. Skipped when the OS
/// credential store is unavailable — rotating would strand the persisted
/// token once the grace window closes. A 409 means another install rotated
/// first; the current token is kept.
async fn rotate_session(state: &AppState) {
    let account = &state.account;
    if !account.snapshot().secure_storage {
        return;
    }
    let Some(token) = account.token() else { return };
    match request(Endpoint::Rotate, Some(&token), None).await {
        Ok(body) => {
            if let Some(fresh) = body.get("token").and_then(|v| v.as_str()) {
                account.replace_token(&SecretStore, fresh.to_owned());
            }
        }
        Err(ApiError::Rejected(_)) | Err(ApiError::Network(_)) => {}
        Err(ApiError::Unauthorized(_)) => teardown(state),
    }
}
/// Logs out: revokes the backend session when reachable, then tears this
/// machine's session down.
pub async fn logout(state: &AppState) -> AccountSnapshot {
    let account = &state.account;
    account.cancel_oauth();
    if let Some(token) = account.token() {
        if let Err(error) = request(Endpoint::Logout, Some(&token), None).await {
            eprintln!("Vibyra logout revocation skipped: {}", error.message());
        }
    }
    teardown(state);
    account.snapshot()
}
/// Ends the session on this machine: closes running terminals so the next
/// account never inherits them, and clears the credential entry. Every path
/// that ends a session — logging out, losing this device, deleting the
/// account, the backend rejecting the credential — goes through here rather
/// than repeating it. A path that only cleared the credential left every
/// terminal running for the page that reloads next to never see again.
pub fn teardown(state: &AppState) {
    clear_preview_grants(state);
    for id in state.manager.close_all() {
        state.sink.detach(id);
    }
    state.account.clear_session(&SecretStore);
}

pub fn bind_preview_account(state: &AppState, user: Option<&serde_json::Value>) {
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
