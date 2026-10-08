//! Agent V2 request plumbing: one authenticated call and its refusal codes
//! (`{ok:false, code, error}`, branch on `code`).

use reqwest::Method;
use serde_json::Value;
use std::sync::LazyLock;
use std::time::Duration;

/// The runner key and the session travel in headers: a redirect is a refusal,
/// never followed (the shared client would carry the key to the new host).
fn client() -> &'static reqwest::Client {
    static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("the Agent API client")
    });
    &CLIENT
}

#[derive(Clone, Debug, PartialEq)]
pub enum ApiError {
    Refused {
        status: u16,
        code: String,
        message: String,
    },
    Network(String),
}

impl ApiError {
    pub fn code(&self) -> Option<&str> {
        match self {
            Self::Refused { code, .. } => Some(code),
            Self::Network(_) => None,
        }
    }

    /// The run is fenced: another claim took over, or it was cancelled or
    /// finished. Stop working on it and discard local output.
    pub fn fences(&self) -> bool {
        matches!(
            self.code(),
            Some("stale_lease" | "run_cancelled" | "run_finished" | "instruction_pending")
        )
    }

    /// The binding or its key no longer works: register again before claiming.
    pub fn needs_registration(&self) -> bool {
        matches!(
            self.code(),
            Some("invalid_runner_key" | "runtime_not_found" | "host_revoked" | "host_unavailable")
        )
    }

    /// The account is not (or no longer) allowed to use Agent V2.
    pub fn disabled(&self) -> bool {
        matches!(
            self.code(),
            Some("agents_v2_disabled" | "not_in_cohort" | "plan_required")
        )
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Refused {
                status,
                code,
                message,
            } => write!(f, "{status} {code}: {message}"),
            Self::Network(message) => f.write_str(message),
        }
    }
}

/// One authenticated request against `/api/agents/v2/...`: a client route sends the
/// session `token`, a runner route the runner key alone (F-03). `Ok(None)` is 204.
pub async fn send(
    base: &str,
    token: Option<&str>,
    runner_key: Option<&str>,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Option<Value>, ApiError> {
    let mut request = client()
        .request(method, format!("{base}/api/agents/v2/{path}"))
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(30));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if let Some(key) = runner_key {
        request = request.header("X-Vibyra-Runner-Key", key);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| ApiError::Network("Vibyra Cloud could not be reached".into()))?;
    let status = response.status().as_u16();
    if status == 204 {
        return Ok(None);
    }
    let value: Value = response.json().await.unwrap_or(Value::Null);
    if (200..300).contains(&status) {
        return Ok(Some(value));
    }
    let code = value["code"].as_str().unwrap_or(match status {
        401 => "unauthenticated",
        422 => "invalid_request",
        429 => "throttled",
        _ => "http_error",
    });
    let message = value["error"]
        .as_str()
        .or(value["message"].as_str())
        .unwrap_or("Vibyra Cloud refused the request")
        .chars()
        .take(300)
        .collect();
    Err(ApiError::Refused {
        status,
        code: code.to_owned(),
        message,
    })
}

#[cfg(test)]
#[path = "api_send_tests.rs"]
mod tests;
