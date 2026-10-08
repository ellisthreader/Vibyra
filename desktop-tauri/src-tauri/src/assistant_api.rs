//! Built-in AI uses the Vibyra account service. Provider credentials never enter the app.
use reqwest::{Client, Method, Response};
use serde::Deserialize;
use serde_json::Value;
use std::sync::LazyLock;
use std::time::Duration;

use crate::state::AppState;

static CLIENT: LazyLock<Result<Client, String>> = LazyLock::new(|| {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .read_timeout(Duration::from_secs(40))
        .timeout(Duration::from_secs(100))
        .build()
        .map_err(|_| "The Vibyra assistant could not start.".into())
});

#[derive(Deserialize)]
pub struct Status {
    pub available: bool,
    pub reason: Option<String>,
}

pub fn token(state: &AppState) -> Result<String, String> {
    state
        .account
        .token()
        .ok_or_else(|| "Sign in to Vibyra to use the assistant.".into())
}

pub fn same_account(state: &AppState, token: &str) -> Result<(), String> {
    if state.account.token().as_deref() == Some(token) {
        Ok(())
    } else {
        Err("Your Vibyra session changed. Please start again.".into())
    }
}

pub async fn status(state: &AppState) -> Status {
    let result = async {
        let token = token(state)?;
        let response = request(Method::GET, "status", &token, None).await?;
        response
            .json::<Status>()
            .await
            .map_err(|_| "Vibyra could not check assistant availability.".into())
    }
    .await;
    result.unwrap_or_else(|reason| Status {
        available: false,
        reason: Some(reason),
    })
}

/// No automatic retries: a failed transport may already have incurred provider usage.
pub async fn post(path: &str, token: &str, mut body: Value) -> Result<Response, String> {
    // Cancellation IDs may span multiple tool turns. Each paid HTTP request is distinct.
    body["requestId"] = Value::String(uuid::Uuid::new_v4().to_string());
    request(Method::POST, path, token, Some(body)).await
}

async fn request(
    method: Method,
    path: &str,
    token: &str,
    body: Option<Value>,
) -> Result<Response, String> {
    request_at(&crate::account_api::base_url(), method, path, token, body).await
}

async fn request_at(
    base: &str,
    method: Method,
    path: &str,
    token: &str,
    body: Option<Value>,
) -> Result<Response, String> {
    if !matches!(path, "status" | "chat" | "transcriptions" | "speech") {
        return Err("Unknown Vibyra assistant request.".into());
    }
    let base = validated_base(base)?;
    let client = CLIENT.as_ref().map_err(Clone::clone)?;
    let mut request = client
        .request(method, format!("{base}/api/assistant/{path}"))
        .bearer_auth(token)
        .header("Accept", "application/json");
    if let Some(version) = crate::account_api::app_version() {
        request = request.header("X-Vibyra-Desktop", version);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Vibyra could not reach the assistant. Check your connection.".to_string())?;
    if response.status().is_success() {
        return Ok(response);
    }
    // Only our public error field is displayed; never upstream bodies, URLs or credentials.
    let status = response.status().as_u16();
    let value = response.json::<Value>().await.unwrap_or(Value::Null);
    Err(value
        .get("error")
        .and_then(Value::as_str)
        .filter(|s| s.len() <= 500)
        .map(String::from)
        .unwrap_or_else(|| match status {
            401 => "Sign in to Vibyra to use the assistant.".into(),
            429 => {
                "The assistant allowance is temporarily unavailable. Please try again later.".into()
            }
            _ => "The Vibyra assistant is temporarily unavailable. Please try again.".into(),
        }))
}

fn validated_base(base: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(base).map_err(|_| "Invalid Vibyra service address.")?;
    let local = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
    if (url.scheme() != "https" && !(url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("Vibyra assistant requests require a secure service address.".into());
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

#[cfg(test)]
#[path = "assistant_api_tests.rs"]
mod tests;
