use crate::{
    account_api::{request, Endpoint},
    account_security,
    state::AppState,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Delivery {
    pub method: String,
    pub destination: Option<String>,
    pub code_sent: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Enrollment {
    pub enrollment_id: String,
    pub method: String,
    pub secret: Option<String>,
    pub uri: Option<String>,
    pub account: String,
}

pub async fn login_delivery(state: &AppState, send: bool) -> Result<Delivery, String> {
    let (epoch, challenge) = state.account.begin_code_attempt().ok_or("Sign in again.")?;
    let result = request(
        Endpoint::LoginTwoFactorCode,
        None,
        Some(serde_json::json!({"challengeId":challenge,"send":send})),
    )
    .await;
    state
        .account
        .with_attempt(epoch, || result.map_err(|e| e.message().to_owned()))
        .ok_or("Sign-in changed. Try again.")?
        .map(|body| delivery(&body))
}

pub async fn settings_code(state: &AppState) -> Result<(), String> {
    account_security::call(state, Endpoint::TwoFactorCode, Some(serde_json::json!({}))).await?;
    Ok(())
}

pub async fn start(
    state: &AppState,
    method: String,
    phone_number: String,
    current_code: String,
) -> Result<Enrollment, String> {
    if !matches!(method.as_str(), "totp" | "sms" | "email") {
        return Err("Choose a verification method.".into());
    }
    let body = account_security::call(state, Endpoint::TwoFactorMethodStart,
        Some(serde_json::json!({"method":method,"phoneNumber":phone_number,"currentCode":current_code.trim()}))).await?;
    let id = body["enrollmentId"]
        .as_str()
        .ok_or("Unexpected security setup.")?;
    uuid::Uuid::parse_str(id).map_err(|_| "Unexpected security setup.")?;
    let uri = text(&body, "uri");
    if uri
        .as_ref()
        .is_some_and(|v| !v.starts_with("otpauth://totp/"))
    {
        return Err("Unexpected setup link.".into());
    }
    Ok(Enrollment {
        enrollment_id: id.into(),
        method,
        secret: text(&body, "secret"),
        uri,
        account: text(&body, "account").unwrap_or_default(),
    })
}

pub async fn resend(state: &AppState, enrollment_id: String) -> Result<(), String> {
    uuid::Uuid::parse_str(&enrollment_id).map_err(|_| "Invalid setup.")?;
    account_security::call(
        state,
        Endpoint::TwoFactorMethodCode,
        Some(serde_json::json!({"enrollmentId":enrollment_id})),
    )
    .await?;
    Ok(())
}

pub async fn confirm(
    state: &AppState,
    enrollment_id: String,
    code: String,
) -> Result<Vec<String>, String> {
    uuid::Uuid::parse_str(&enrollment_id).map_err(|_| "Invalid setup.")?;
    let body = account_security::call(
        state,
        Endpoint::TwoFactorMethodConfirm,
        Some(serde_json::json!({"enrollmentId":enrollment_id,"code":code.trim()})),
    )
    .await?;
    Ok(account_security::recovery_codes(&body))
}

fn delivery(body: &serde_json::Value) -> Delivery {
    Delivery {
        method: text(body, "method")
            .filter(|m| matches!(m.as_str(), "totp" | "sms" | "email"))
            .unwrap_or("totp".into()),
        destination: text(body, "destination"),
        code_sent: body["codeSent"].as_bool().unwrap_or(false),
    }
}
fn text(body: &serde_json::Value, key: &str) -> Option<String> {
    body[key].as_str().map(str::to_owned)
}
