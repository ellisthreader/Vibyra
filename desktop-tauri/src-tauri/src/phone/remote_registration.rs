//! One account-bound ownership proof. Transfer is called only by the explicit
//! Settings confirmation; reconnect always uses Register.
use crate::{
    account_api::{request, request_raw, ApiError, Endpoint},
    account_session::AccountSessionManager,
};
use serde_json::json;
use vibyra_host::{RegistrationProof, RelayCredentials};

pub(crate) const TRANSFER_REQUIRED: &str = "host-transfer-required:";
pub(crate) enum Action {
    Register,
    Transfer,
}

pub(crate) async fn register(
    account: &AccountSessionManager,
    token: &str,
    host_id: &str,
    name: String,
    proof: &RegistrationProof,
    action: Action,
    validate: &(dyn Fn() -> Result<(), String> + Send + Sync),
) -> Result<RelayCredentials, String> {
    validate()?;
    let account_scope = account
        .snapshot()
        .profile
        .ok_or(super::remote::SIGNED_OUT)?
        .welcome_key;
    let action = match action {
        Action::Register => "register",
        Action::Transfer => "transfer",
    };
    let (status, challenge) = request_raw(
        Endpoint::RemoteChallenge,
        Some(token),
        Some(json!({"hostId":host_id,"action":action})),
    )
    .await
    .map_err(|error| error.message().to_owned())?;
    if !(200..300).contains(&status) {
        let error = challenge["error"]
            .as_str()
            .unwrap_or("Vibyra Cloud could not verify this computer.");
        if status == 409
            && (challenge["code"] == "host_transfer_required"
                || error
                    == "This computer needs an explicitly approved account transfer on the Mac.")
        {
            return Err(format!(
                "{TRANSFER_REQUIRED} This computer belongs to another Vibyra account."
            ));
        }
        return Err(error.to_owned());
    }
    let id = challenge["challengeId"]
        .as_str()
        .filter(|id| uuid::Uuid::parse_str(id).is_ok())
        .ok_or("Vibyra Cloud returned an invalid ownership challenge.")?;
    let ciphertext = challenge["ciphertext"]
        .as_str()
        .ok_or("Vibyra Cloud returned an invalid ownership challenge.")?;
    let answer = proof.answer(ciphertext)?;
    if account.token().as_deref() != Some(token) {
        return Err(super::remote::SIGNED_OUT.into());
    }
    validate()?;
    let body = json!({"hostId":host_id,"name":name,"platform":std::env::consts::OS,
        "version":env!("CARGO_PKG_VERSION"),"challengeId":id,"proof":answer});
    let reply = request(Endpoint::RemoteRegister, Some(token), Some(body))
        .await
        .map_err(|error| match error {
            ApiError::Unauthorized(_) => super::remote::SIGNED_OUT.to_owned(),
            other => other.message().to_owned(),
        })?;
    let url = reply["relayUrl"].as_str().unwrap_or_default().to_owned();
    if account.token().as_deref() != Some(token)
        || account
            .snapshot()
            .profile
            .as_ref()
            .map(|profile| profile.welcome_key.as_str())
            != Some(account_scope.as_str())
    {
        return Err(super::remote::SIGNED_OUT.into());
    }
    validate()?;
    let token = reply["token"].as_str().unwrap_or_default().to_owned();
    if !url.starts_with("wss://") && !url.starts_with("ws://127.0.0.1") {
        return Err("Vibyra Cloud did not offer a secure relay address.".into());
    }
    if token.len() < 32 {
        return Err("Vibyra Cloud did not issue a relay token.".into());
    }
    let (authorization_key, authorization_context) = authorization(&reply)?;
    proof.bind_restriction_context(&account_scope, &authorization_context)?;
    Ok(RelayCredentials {
        url,
        token,
        name,
        authorization_key: Some(authorization_key),
        authorization_context: Some(authorization_context),
        allow_unsigned_loopback: false,
    })
}

fn authorization(
    reply: &serde_json::Value,
) -> Result<(String, vibyra_host::AuthorizationContext), String> {
    use base64::Engine;
    let key = reply["authorizationKey"]
        .as_str()
        .filter(|key| {
            base64::engine::general_purpose::STANDARD
                .decode(key)
                .is_ok_and(|bytes| bytes.len() == 32)
        })
        .ok_or("Vibyra Cloud needs its remote security update before this computer can connect.")?;
    let context: vibyra_host::AuthorizationContext =
        serde_json::from_value(reply["authorizationContext"].clone())
            .map_err(|_| "Vibyra Cloud did not bind this computer to an account.")?;
    if context.user_id.is_empty() || context.generation == 0 {
        return Err("Vibyra Cloud did not bind this computer to an account.".into());
    }
    Ok((key.to_owned(), context))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unsigned_old_backend_and_missing_account_binding_fail_closed() {
        let key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
        for reply in [
            json!({}),
            json!({"authorizationKey":key}),
            json!({"authorizationKey":"invalid","authorizationContext":{"userId":"1","generation":1}}),
            json!({"authorizationKey":key,"authorizationContext":{"userId":"1","generation":0}}),
        ] {
            assert!(authorization(&reply).is_err());
        }
        assert!(authorization(&json!({"authorizationKey":key,
            "authorizationContext":{"userId":"1","generation":1}}))
        .is_ok());
    }
}
