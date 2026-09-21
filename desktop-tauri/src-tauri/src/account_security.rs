use serde::Serialize;

use crate::account_api::{request, ApiError, Endpoint};
use crate::account_types::profile_from_user;
use crate::secret_store::SecretStore;
use crate::state::AppState;

/// What Settings says about the second factor. The secret is never part of
/// this: it leaves the server exactly once, when a setup starts.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TwoFactorState {
    pub enabled: bool,
    /// False for an Apple or Google account, whose second step belongs to
    /// the provider rather than to Vibyra.
    pub available: bool,
    pub confirmed_at: Option<String>,
    pub recovery_codes_left: u32,
}

/// The one sight of a new secret: the `otpauth://` link a QR carries, and
/// the same secret in the form an app that cannot scan will accept.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwoFactorSetup {
    pub secret: String,
    pub uri: String,
    pub account: String,
}

pub async fn status(state: &AppState) -> Result<TwoFactorState, String> {
    let body = call(state, Endpoint::TwoFactorStatus, None).await?;
    Ok(TwoFactorState {
        enabled: flag(&body, "enabled"),
        available: flag(&body, "available"),
        confirmed_at: text(&body, "confirmedAt"),
        recovery_codes_left: body
            .get("recoveryCodesLeft")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
    })
}

pub async fn start(state: &AppState) -> Result<TwoFactorSetup, String> {
    let body = call(state, Endpoint::TwoFactorStart, Some(serde_json::json!({}))).await?;
    let uri = text(&body, "uri").filter(|uri| uri.starts_with("otpauth://"));
    match (text(&body, "secret"), uri) {
        (Some(secret), Some(uri)) => Ok(TwoFactorSetup {
            secret,
            uri,
            account: text(&body, "account").unwrap_or_default(),
        }),
        _ => Err(UNEXPECTED.to_owned()),
    }
}

/// Turns a pending setup on. The answer carries the recovery codes, which
/// are readable this once and never again.
pub async fn confirm(state: &AppState, code: String) -> Result<Vec<String>, String> {
    let body = call(state, Endpoint::TwoFactorConfirm, Some(code_body(&code))).await?;
    adopt_profile(state, &body);
    Ok(recovery_codes(&body))
}

pub async fn replace_recovery_codes(state: &AppState, code: String) -> Result<Vec<String>, String> {
    let body = call(state, Endpoint::TwoFactorRecovery, Some(code_body(&code))).await?;
    Ok(recovery_codes(&body))
}

/// Turning it off takes the same proof turning it on did: a code from the
/// app or a recovery code. A password is never a substitute.
pub async fn disable(state: &AppState, code: String) -> Result<(), String> {
    let body = call(state, Endpoint::TwoFactorDisable, Some(code_body(&code))).await?;
    adopt_profile(state, &body);
    Ok(())
}

/// Where an account whose sign-in belongs to a provider adds its second
/// step. Enumerated here, like the legal pages: the renderer names a
/// provider, never an address.
pub fn open_provider_security(provider: &str) -> Result<(), String> {
    let url = match provider {
        "google" => "https://myaccount.google.com/security",
        "apple" => "https://account.apple.com/account/manage",
        _ => return Err("That sign-in has no security page Vibyra can open.".to_owned()),
    };
    crate::provider_auth_url::open(url)
}

const UNEXPECTED: &str = "The account service returned an unexpected response.";

async fn call(
    state: &AppState,
    endpoint: Endpoint<'_>,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let Some(token) = state.account.token() else {
        return Err("You are not signed in.".to_owned());
    };
    match request(endpoint, Some(&token), body).await {
        Ok(value) => Ok(value),
        // A rejected code is a 422, not a 401: only an authoritative refusal
        // of the session itself may end it.
        Err(ApiError::Unauthorized(message)) => {
            state.account.clear_session(&SecretStore);
            Err(message)
        }
        Err(error) => Err(error.message().to_owned()),
    }
}

fn code_body(code: &str) -> serde_json::Value {
    serde_json::json!({ "code": code.trim().replace(' ', "") })
}

/// Confirming and disabling both answer with the updated account, so the
/// pane's two-factor row and the profile never disagree.
fn adopt_profile(state: &AppState, body: &serde_json::Value) {
    if let Some(profile) = profile_from_user(body.get("user").unwrap_or(&serde_json::Value::Null)) {
        state.account.set_profile(profile);
    }
}

fn recovery_codes(body: &serde_json::Value) -> Vec<String> {
    body.get("recoveryCodes")
        .and_then(|v| v.as_array())
        .map(|codes| {
            codes
                .iter()
                .filter_map(|code| code.as_str())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn flag(body: &serde_json::Value, key: &str) -> bool {
    body.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn text(body: &serde_json::Value, key: &str) -> Option<String> {
    body.get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
}
