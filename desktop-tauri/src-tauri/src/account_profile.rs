use crate::account_api::{request, ApiError, Endpoint};
use crate::account_types::{profile_from_user, AccountSnapshot};
use crate::secret_store::SecretStore;
use crate::state::AppState;

/// Re-reads the safe profile from the backend. An authoritative 401/403
/// signs the user out; other failures leave the current profile in place.
pub async fn refresh(state: &AppState) -> Result<AccountSnapshot, String> {
    let account = &state.account;
    let Some(token) = account.token() else {
        return Ok(account.snapshot());
    };
    match request(Endpoint::Session, Some(&token), None).await {
        Ok(body) => {
            if let Some(profile) =
                profile_from_user(body.get("user").unwrap_or(&serde_json::Value::Null))
            {
                account.set_profile(profile);
            }
            Ok(account.snapshot())
        }
        Err(ApiError::Unauthorized(_)) => {
            account.clear_session(&SecretStore);
            Ok(account.snapshot())
        }
        Err(error) => Err(error.message().to_owned()),
    }
}

/// Updates display name and, for email accounts only, the address. The
/// backend enforces the provider rule; its message is surfaced verbatim.
pub async fn update(
    state: &AppState,
    name: String,
    email: String,
) -> Result<AccountSnapshot, String> {
    let account = &state.account;
    let Some(token) = account.token() else {
        return Err("You are not signed in.".to_owned());
    };
    let body = serde_json::json!({ "name": name.trim(), "email": email.trim().to_lowercase() });
    match request(Endpoint::Profile, Some(&token), Some(body)).await {
        Ok(response) => {
            if let Some(profile) =
                profile_from_user(response.get("user").unwrap_or(&serde_json::Value::Null))
            {
                account.set_profile(profile);
            }
            Ok(account.snapshot())
        }
        Err(ApiError::Unauthorized(_)) => {
            account.clear_session(&SecretStore);
            Err("Your session expired. Please log in again.".to_owned())
        }
        Err(error) => Err(error.message().to_owned()),
    }
}

/// Requests a password-recovery email. Enumeration-safe on the backend, so
/// the confirmation copy is always neutral.
pub async fn password_forgot(email: String) -> Result<String, String> {
    let body = serde_json::json!({ "email": email.trim().to_lowercase() });
    match request(Endpoint::PasswordForgot, None, Some(body)).await {
        Ok(response) => Ok(message_or(
            &response,
            "If that email belongs to a Vibyra password account, a reset link has been sent.",
        )),
        Err(error) => Err(error.message().to_owned()),
    }
}

/// Resends the verification email for the signed-in account.
pub async fn resend_verification(state: &AppState) -> Result<String, String> {
    let email = state
        .account
        .snapshot()
        .profile
        .map(|profile| profile.email)
        .ok_or_else(|| "You are not signed in.".to_owned())?;
    let body = serde_json::json!({ "email": email });
    match request(Endpoint::EmailResend, None, Some(body)).await {
        Ok(response) => Ok(message_or(&response, "Verification email sent.")),
        Err(error) => Err(error.message().to_owned()),
    }
}

fn message_or(value: &serde_json::Value, fallback: &str) -> String {
    value
        .get("message")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or(fallback)
        .to_owned()
}
