//! Account-bound relay credentials for a headless cloud computer. Before every
//! relay attempt: challenge -> sealed-box proof -> register, exactly the steps
//! Vibyra Desktop takes, but authenticated by the runtime bearer token (read
//! from its file each time, since it can rotate) and scoped to one workspace.
use crate::{
    account_http::post_json,
    config::Account,
    relay::{CredentialSource, RelayCredentials},
    remote_authorization::AuthorizationContext,
    state::Shared,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::sync::Arc;

/// Re-read on every call; never cached, never logged.
pub(crate) fn read_token(path: &std::path::Path) -> Result<String, String> {
    let token = std::fs::read_to_string(path).map_err(|_| "Cannot read the runtime token file")?;
    let token = token.trim();
    if token.is_empty() || token.len() > 4096 || token.chars().any(|c| c.is_control() || c == ' ') {
        return Err("The runtime token file does not hold a valid token".into());
    }
    Ok(token.to_owned())
}

fn failure(status: u16, reply: &Value, fallback: &str) -> String {
    let message = reply["error"]
        .as_str()
        .or_else(|| reply["message"].as_str())
        .filter(|m| !m.is_empty() && m.len() <= 200 && !m.chars().any(char::is_control));
    match (status, message) {
        (401 | 403, _) => "Vibyra Cloud refused this runtime; waiting for a fresh token".into(),
        (_, Some(message)) => message.to_owned(),
        _ => fallback.to_owned(),
    }
}

/// Valid only with a 32-byte verification key and an account binding, so an
/// older or tampered backend can never leave the relay unsigned.
pub(crate) fn authorization(reply: &Value) -> Result<(String, AuthorizationContext), String> {
    let key = reply["authorizationKey"]
        .as_str()
        .filter(|key| STANDARD.decode(key).is_ok_and(|bytes| bytes.len() == 32))
        .ok_or("Vibyra Cloud needs its remote security update before this computer can connect.")?;
    let context: AuthorizationContext =
        serde_json::from_value(reply["authorizationContext"].clone())
            .map_err(|_| "Vibyra Cloud did not bind this computer to an account.")?;
    if context.user_id.is_empty() || context.generation == 0 {
        return Err("Vibyra Cloud did not bind this computer to an account.".into());
    }
    Ok((key.to_owned(), context))
}

/// Pure validation of a register reply into credentials plus the trusted flag.
pub(crate) fn credentials(reply: &Value, name: String) -> Result<(RelayCredentials, bool), String> {
    let url = reply["relayUrl"].as_str().unwrap_or_default().to_owned();
    if !url.starts_with("wss://") {
        return Err("Vibyra Cloud did not offer a secure relay address.".into());
    }
    let token = reply["token"].as_str().unwrap_or_default().to_owned();
    if token.len() < 32 {
        return Err("Vibyra Cloud did not issue a relay token.".into());
    }
    let (key, context) = authorization(reply)?;
    let trusted = reply["hostPolicy"] == "trusted" || reply["trusted"] == true;
    Ok((
        RelayCredentials {
            url,
            token,
            name,
            authorization_key: Some(key),
            authorization_context: Some(context),
            allow_unsigned_loopback: false,
        },
        trusted,
    ))
}

/// Fails closed: headless trust is dropped before every attempt and again on
/// every failure, so a network or HTTP error can never leave a stale "trusted".
pub(crate) async fn register(
    shared: &Arc<Shared>,
    account: &Account,
) -> Result<RelayCredentials, String> {
    crate::cloud_trust::set(false);
    let result = register_attempt(shared, account).await;
    if result.is_err() {
        crate::cloud_trust::set(false);
    }
    result
}

async fn register_attempt(
    shared: &Arc<Shared>,
    account: &Account,
) -> Result<RelayCredentials, String> {
    let bearer = read_token(&account.token_file)?;
    let (host_id, name) = {
        let identity = shared.identity.lock().map_err(|_| "Identity unavailable")?;
        (identity.id(), identity.name.clone())
    };
    let base = format!("/api/cloud-runtime/{}/host", account.workspace_id);
    let (status, challenge) = post_json(
        &account.api_base,
        &format!("{base}/challenge"),
        &bearer,
        &json!({"hostId":host_id}),
    )
    .await?;
    if !(200..300).contains(&status) {
        return Err(failure(
            status,
            &challenge,
            "Vibyra Cloud could not verify this computer.",
        ));
    }
    let id = challenge["challengeId"]
        .as_str()
        .filter(|id| !id.is_empty() && id.len() <= 64)
        .ok_or("Vibyra Cloud returned an invalid ownership challenge.")?;
    let ciphertext = challenge["ciphertext"]
        .as_str()
        .ok_or("Vibyra Cloud returned an invalid ownership challenge.")?;
    let proof = crate::ownership_proof::answer(shared, ciphertext)?;
    // The token may have rotated while the challenge was in flight.
    let bearer = read_token(&account.token_file)?;
    let (status, reply) = post_json(
        &account.api_base,
        &format!("{base}/register"),
        &bearer,
        &json!({"hostId":host_id,"name":name,"platform":std::env::consts::OS,
            "version":env!("CARGO_PKG_VERSION"),"challengeId":id,"proof":proof,
            "wantTrusted":true}),
    )
    .await?;
    if !(200..300).contains(&status) {
        return Err(failure(
            status,
            &reply,
            "Vibyra Cloud could not register this computer.",
        ));
    }
    let (credentials, trusted) = match credentials(&reply, name) {
        Ok(ok) => ok,
        Err(error) => {
            crate::cloud_trust::set(false);
            return Err(error);
        }
    };
    let context = credentials.authorization_context.as_ref().expect("checked");
    shared.bind_restrictions(&account.workspace_id, &context.user_id, context.generation)?;
    crate::cloud_trust::set(trusted);
    Ok(credentials)
}

pub(crate) fn source(shared: Arc<Shared>, account: Account) -> CredentialSource {
    Arc::new(move || {
        let shared = shared.clone();
        let account = account.clone();
        Box::pin(async move { register(&shared, &account).await })
    })
}
