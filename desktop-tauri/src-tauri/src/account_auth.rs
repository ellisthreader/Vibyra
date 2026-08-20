use crate::account_api::{request, ApiError, Endpoint};
use crate::account_device;
use crate::account_types::{profile_from_user, AccountSnapshot, AccountStatus};
use crate::secret_store::SecretStore;
use crate::state::AppState;

/// Restores and verifies a saved session. A stored credential is discarded
/// only on an authoritative 401/403; network trouble preserves it and
/// reports a retryable connection error instead.
pub async fn restore(state: &AppState) -> AccountSnapshot {
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
                account.adopt_session(&store, token, profile);
                rotate_session(state).await;
            }
            None => account.set_status(
                AccountStatus::ConnectionError,
                Some("The account service returned an unexpected response.".into()),
            ),
        },
        Err(ApiError::Unauthorized(_)) => account.clear_session(&store),
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
        Err(ApiError::Unauthorized(_)) => account.clear_session(&SecretStore),
    }
}

pub async fn login_email(state: &AppState, email: String, password: String) -> AccountSnapshot {
    let body = credential_body(&email, &password, None);
    submit_credentials(state, Endpoint::Login, body).await
}

pub async fn signup_email(
    state: &AppState,
    name: String,
    email: String,
    password: String,
) -> AccountSnapshot {
    let body = credential_body(&email, &password, Some(&name));
    submit_credentials(state, Endpoint::Signup, body).await
}

fn credential_body(email: &str, password: &str, name: Option<&str>) -> serde_json::Value {
    let mut body = serde_json::json!({
        "email": email.trim().to_lowercase(),
        "password": password,
        "deviceName": account_device::device_label(),
        "installId": account_device::installation_id(),
    });
    if let Some(name) = name.map(str::trim).filter(|n| !n.is_empty()) {
        body["name"] = serde_json::Value::String(name.to_owned());
    }
    body
}

async fn submit_credentials(
    state: &AppState,
    endpoint: Endpoint<'_>,
    body: serde_json::Value,
) -> AccountSnapshot {
    let account = &state.account;
    account.begin_authorizing(None);
    match request(endpoint, None, Some(body)).await {
        Ok(response) => {
            let token = response.get("token").and_then(|v| v.as_str());
            let profile =
                profile_from_user(response.get("user").unwrap_or(&serde_json::Value::Null));
            match (token, profile) {
                (Some(token), Some(profile)) => {
                    account.adopt_session(&SecretStore, token.to_owned(), profile);
                }
                _ => account.set_status(
                    AccountStatus::SignedOut,
                    Some("The account service returned an unexpected response.".into()),
                ),
            }
        }
        Err(error) => {
            account.set_status(AccountStatus::SignedOut, Some(error.message().into()));
        }
    }
    account.snapshot()
}

/// Logs out: revokes the backend session when reachable, closes running
/// terminal sessions so the next account never inherits them, and clears
/// the credential entry.
pub async fn logout(state: &AppState) -> AccountSnapshot {
    let account = &state.account;
    account.cancel_oauth();
    if let Some(token) = account.token() {
        if let Err(error) = request(Endpoint::Logout, Some(&token), None).await {
            eprintln!("Vibyra logout revocation skipped: {}", error.message());
        }
    }
    for session in state.manager.list() {
        let _ = state.manager.kill(session.id);
        let _ = state.manager.remove(session.id);
    }
    account.clear_session(&SecretStore);
    account.snapshot()
}
