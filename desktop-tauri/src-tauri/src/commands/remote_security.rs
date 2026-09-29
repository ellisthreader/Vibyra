use super::remote_security_scope::{Context, Scope};
use crate::state::AppState;
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeviceDecision {
    id: String,
    public_key: String,
    pairing_code: String,
    permissions: Vec<String>,
    approve: bool,
}

#[path = "remote_security_revocation.rs"]
mod revocation;
#[path = "remote_security_snapshot.rs"]
mod snapshot;
pub use revocation::RevokeTarget;

#[tauri::command]
pub async fn remote_security_snapshot(state: State<'_, AppState>) -> Result<Value, String> {
    snapshot::load(&state).await
}

#[tauri::command]
pub async fn remote_security_decide_device(
    state: State<'_, AppState>,
    scope: Scope,
    decision: DeviceDecision,
) -> Result<(), String> {
    uuid::Uuid::parse_str(&decision.id).map_err(|_| "Invalid device request.")?;
    let context = Context::capture(&state, Some(&scope))?;
    let action = if decision.approve { "approve" } else { "deny" };
    let path = format!(
        "/api/remote/hosts/{}/devices/{}",
        scope.host_id, decision.id
    );
    let challenge = context
        .request(
            &state,
            Method::POST,
            &format!("{path}/challenge"),
            Some(json!({"decision":action})),
        )
        .await?;
    verify_device_challenge(&challenge, &scope, &decision, action)?;
    let answer = context
        .proof
        .as_ref()
        .ok_or("Start sharing on this computer first.")?
        .answer(
            challenge["ciphertext"]
                .as_str()
                .ok_or("Invalid device verification.")?,
        )?;
    let result = context
        .request(
            &state,
            Method::POST,
            &format!("{path}/decision"),
            Some(json!({"decision":action,"challengeId":challenge["challengeId"],"proof":answer})),
        )
        .await?;
    context.check(&state)?;
    if decision.approve {
        let device = &result["device"];
        if device["publicKey"] != decision.public_key
            || device["hostId"] != scope.host_id
            || !device["approvedAt"].is_string()
        {
            return Err("The approved device did not match. Review remote access again.".into());
        }
        state.phone.lock().host()?.approve_remote_device(
            &decision.public_key,
            device["deviceName"].as_str().unwrap_or("Remote device"),
        )?;
    }
    Ok(())
}

fn verify_device_challenge(
    challenge: &Value,
    scope: &Scope,
    decision: &DeviceDecision,
    action: &str,
) -> Result<(), String> {
    let mut expected = decision.permissions.clone();
    expected.sort();
    expected.dedup();
    let actual: Vec<String> = serde_json::from_value(challenge["permissions"].clone())
        .map_err(|_| "Review this device again.")?;
    if challenge["hostId"] != scope.host_id
        || challenge["deviceId"] != decision.id
        || challenge["purpose"] != action
        || challenge["publicKey"] != decision.public_key
        || actual != expected
        || challenge["pairingCode"] != decision.pairing_code
    {
        return Err("The request changed. Review this device again.".into());
    }
    Ok(())
}

#[cfg(test)]
#[path = "remote_security_device_tests.rs"]
mod tests;

#[tauri::command]
pub async fn remote_security_revoke(
    state: State<'_, AppState>,
    scope: Scope,
    kind: String,
    id: String,
    target: Option<RevokeTarget>,
) -> Result<(), String> {
    let context = Context::capture(&state, Some(&scope))?;
    let path = match kind.as_str() {
        "device" if uuid::Uuid::parse_str(&id).is_ok() => format!("/api/security/devices/{id}"),
        "session"
            if id.len() == 32
                && id
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) =>
        {
            format!("/api/remote/sessions/{id}")
        }
        "passkey" if !id.is_empty() && id.bytes().all(|c| c.is_ascii_digit()) => {
            format!("/api/security/passkeys/{id}")
        }
        "devices" if id.is_empty() => "/api/security/devices".into(),
        _ => return Err("Invalid remote security action.".into()),
    };
    let target = match kind.as_str() {
        "session" => revocation::Target::Session(&id),
        "passkey" => revocation::Target::Passkey,
        _ => revocation::target(&kind, target.as_ref(), &scope.host_id)?,
    };
    revocation::restrict_then_cloud(
        || revocation::local(&state, target),
        context.request(&state, Method::DELETE, &path, None),
    )
    .await
}
