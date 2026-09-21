use serde::Serialize;

use crate::account_api::{request, ApiError, Endpoint};
use crate::account_auth;
use crate::secret_store::SecretStore;
use crate::state::AppState;

/// One place this account is signed in. The raw address and user agent stay
/// on the backend: where it is and when it was last used is the human fact,
/// and the rest only invites reading an IP as a location.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDevice {
    pub id: String,
    pub name: String,
    pub location: String,
    pub last_active: Option<String>,
    pub current: bool,
}

/// What a sign-out did. `signed_out` means this Mac lost its own session, so
/// the caller returns to the sign-in screen.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevokeOutcome {
    pub signed_out: bool,
}

pub async fn list(state: &AppState) -> Result<Vec<AccountDevice>, String> {
    let body = call(state, Endpoint::AccountSessions, None).await?;
    let devices = body
        .get("devices")
        .and_then(|v| v.as_array())
        .map(|rows| rows.iter().filter_map(device).collect())
        .unwrap_or_default();
    Ok(devices)
}

/// Signs out one device. Losing this one tears the local session down so a
/// revoked bearer is never left in the keyring.
pub async fn revoke_device(state: &AppState, device: String) -> Result<RevokeOutcome, String> {
    let body = call(state, Endpoint::RevokeDevice(&device), None).await?;
    finish(state, &body)
}

/// Signs out every device, this one included.
pub async fn revoke_all(state: &AppState) -> Result<RevokeOutcome, String> {
    let body = call(state, Endpoint::RevokeSessions, None).await?;
    finish(state, &body)
}

fn finish(state: &AppState, body: &serde_json::Value) -> Result<RevokeOutcome, String> {
    let signed_out = body
        .get("currentRevoked")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if signed_out {
        account_auth::teardown(state);
    }
    Ok(RevokeOutcome { signed_out })
}

fn device(row: &serde_json::Value) -> Option<AccountDevice> {
    let id = text(row, "id")?;
    Some(AccountDevice {
        id,
        name: text(row, "deviceName").unwrap_or_else(|| "Vibyra device".to_owned()),
        location: text(row, "location").unwrap_or_default(),
        last_active: text(row, "updatedAt"),
        current: row
            .get("current")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}

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
        Err(ApiError::Unauthorized(message)) => {
            state.account.clear_session(&SecretStore);
            Err(message)
        }
        Err(error) => Err(error.message().to_owned()),
    }
}

fn text(row: &serde_json::Value, key: &str) -> Option<String> {
    row.get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
}
