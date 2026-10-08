use std::time::Duration;

const PRODUCTION_URL: &str = "https://vibyra-production.up.railway.app";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const RETRY_DELAY: Duration = Duration::from_secs(1);
static OAUTH_CLIENT: std::sync::LazyLock<Result<reqwest::Client, reqwest::Error>> =
    std::sync::LazyLock::new(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
    });

/// The app's release version, sent as `X-Vibyra-Desktop` so the account service
/// can ask an outdated build to update once plan limits are on.
static APP_VERSION: std::sync::OnceLock<String> = std::sync::OnceLock::new();

pub fn set_app_version(version: String) {
    let _ = APP_VERSION.set(version);
}

pub fn app_version() -> Option<&'static str> {
    APP_VERSION.get().map(String::as_str)
}

/// Errors split by what the caller may safely conclude. Only `Unauthorized`
/// permits discarding a stored session; `Network` must preserve it.
#[derive(Debug, Clone)]
pub enum ApiError {
    Unauthorized(String),
    Rejected(String),
    Network(String),
}

impl ApiError {
    pub fn message(&self) -> &str {
        match self {
            ApiError::Unauthorized(m) | ApiError::Rejected(m) | ApiError::Network(m) => m,
        }
    }
}

pub use crate::account_endpoints::Endpoint;

pub fn base_url() -> String {
    if let Ok(url) = std::env::var("VIBYRA_DESKTOP_API_URL") {
        let url = url.trim().trim_end_matches('/').to_owned();
        let loopback = url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost");
        if loopback || url.starts_with("https://") {
            return url;
        }
        eprintln!("Vibyra ignored a non-HTTPS account API override.");
    }
    PRODUCTION_URL.into()
}

/// Performs a request and returns `(http_status, parsed_body)` without
/// interpreting the outcome. Retries once on transport failure because the
/// backend can cold-start. Transport errors are reported without URLs so
/// flow identifiers never reach logs or the UI.
pub async fn request_raw(
    endpoint: Endpoint<'_>,
    token: Option<&str>,
    body: Option<serde_json::Value>,
) -> Result<(u16, serde_json::Value), ApiError> {
    request_raw_with_flow_secret(endpoint, token, body, None).await
}

/// The OAuth claim proof remains native and travels only in the dedicated header.
pub(crate) async fn request_raw_with_flow_secret(
    endpoint: Endpoint<'_>,
    token: Option<&str>,
    body: Option<serde_json::Value>,
    flow_secret: Option<&str>,
) -> Result<(u16, serde_json::Value), ApiError> {
    request_raw_at(&base_url(), endpoint, token, body, flow_secret).await
}

async fn request_raw_at(
    base: &str,
    endpoint: Endpoint<'_>,
    token: Option<&str>,
    body: Option<serde_json::Value>,
    flow_secret: Option<&str>,
) -> Result<(u16, serde_json::Value), ApiError> {
    let url = format!("{}{}", base, endpoint.path()?);
    let method = endpoint.method();
    let client = if matches!(
        endpoint,
        Endpoint::OauthStart(_) | Endpoint::OauthStatus(..)
    ) {
        OAUTH_CLIENT.as_ref().map_err(|_| {
            ApiError::Network("Secure sign-in could not start. Please try again.".into())
        })?
    } else {
        crate::http_client::shared()
    };
    let mut last = String::new();
    // Delivery and method changes must not repeat after an unknown acknowledgement.
    let attempts = if matches!(
        endpoint,
        Endpoint::LoginTwoFactorCode
            | Endpoint::CloudComputerConnectMac
            | Endpoint::CloudComputerWake
            | Endpoint::CloudComputerStop
            | Endpoint::CloudComputerDisconnect
            | Endpoint::CloudComputerRepair
            | Endpoint::CloudComputerProjects
            | Endpoint::CloudComputerProvider(_)
            | Endpoint::TwoFactorCode
            | Endpoint::TwoFactorMethodStart
            | Endpoint::TwoFactorMethodConfirm
            | Endpoint::TwoFactorMethodCode
    ) {
        1
    } else {
        2
    };
    for attempt in 0..attempts {
        if attempt > 0 {
            tokio::time::sleep(RETRY_DELAY).await;
        }
        let mut request = client
            .request(method.clone(), &url)
            .header("Accept", "application/json")
            .timeout(REQUEST_TIMEOUT);
        if let Some(version) = app_version() {
            request = request.header("X-Vibyra-Desktop", version);
        }
        if let Some(secret) = flow_secret {
            request = request.header("X-Vibyra-Flow-Secret", secret);
        }
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        if let Some(body) = &body {
            request = request.json(body);
        }
        match request.send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                let value = response
                    .json::<serde_json::Value>()
                    .await
                    .unwrap_or(serde_json::Value::Null);
                return Ok((status, value));
            }
            Err(error) => last = error.without_url().to_string(),
        }
    }
    eprintln!("Vibyra account request failed: {last}");
    Err(ApiError::Network(
        "Vibyra could not reach the account service. Check your connection and try again.".into(),
    ))
}

/// Performs a request and maps non-success statuses onto typed errors using
/// the backend's `{ok, error}` contract.
pub async fn request(
    endpoint: Endpoint<'_>,
    token: Option<&str>,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, ApiError> {
    let (status, value) = request_raw(endpoint, token, body).await?;
    if (200..300).contains(&status) {
        return Ok(value);
    }
    let detail = error_detail(&value, status);
    match status {
        401 | 403 => Err(ApiError::Unauthorized(detail)),
        500..=599 => Err(ApiError::Network(detail)),
        _ => Err(ApiError::Rejected(detail)),
    }
}

pub fn error_detail(value: &serde_json::Value, status: u16) -> String {
    let field = |key: &str| {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_owned)
    };
    field("error")
        .or_else(|| field("message"))
        .unwrap_or_else(|| match status {
            401 | 403 => "Your session expired. Please log in again.".into(),
            429 => "Too many attempts. Wait a moment and try again.".into(),
            500..=599 => "The Vibyra account service had a problem. Try again shortly.".into(),
            _ => "The Vibyra account service rejected the request.".into(),
        })
}

#[cfg(test)]
#[path = "account_oauth_protocol_tests.rs"]
mod oauth_protocol_tests;

#[cfg(test)]
#[path = "account_oauth_redirect_tests.rs"]
mod oauth_redirect_tests;
