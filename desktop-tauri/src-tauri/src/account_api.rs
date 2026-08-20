use std::time::Duration;

const PRODUCTION_URL: &str = "https://vibyra-production.up.railway.app";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const RETRY_DELAY: Duration = Duration::from_secs(1);

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

/// The only account API paths this client can reach. The renderer never
/// supplies URLs or methods; commands pick a variant.
pub enum Endpoint<'a> {
    Signup,
    Login,
    Session,
    Rotate,
    Logout,
    Profile,
    PasswordForgot,
    EmailResend,
    OauthStart(&'a str),
    OauthStatus(&'a str, &'a str),
}

impl Endpoint<'_> {
    pub(crate) fn path(&self) -> Result<String, ApiError> {
        let invalid = || ApiError::Rejected("Unsupported sign-in provider.".into());
        match self {
            Endpoint::Signup => Ok("/api/auth/signup".into()),
            Endpoint::Login => Ok("/api/auth/login".into()),
            Endpoint::Session => Ok("/api/session".into()),
            Endpoint::Rotate => Ok("/api/auth/session/rotate".into()),
            Endpoint::Logout => Ok("/api/auth/logout".into()),
            Endpoint::Profile => Ok("/api/account/profile".into()),
            Endpoint::PasswordForgot => Ok("/api/auth/password/forgot".into()),
            Endpoint::EmailResend => Ok("/api/auth/email/resend".into()),
            Endpoint::OauthStart(provider) => {
                let provider = valid_provider(provider).ok_or_else(invalid)?;
                Ok(format!("/api/auth/desktop/{provider}/start"))
            }
            Endpoint::OauthStatus(provider, flow) => {
                let provider = valid_provider(provider).ok_or_else(invalid)?;
                let flow_ok = (40..=100).contains(&flow.len())
                    && flow.chars().all(|c| c.is_ascii_alphanumeric());
                if !flow_ok {
                    return Err(ApiError::Rejected("Invalid sign-in attempt.".into()));
                }
                Ok(format!("/api/auth/desktop/{provider}/status/{flow}"))
            }
        }
    }

    fn method(&self) -> reqwest::Method {
        match self {
            Endpoint::Session | Endpoint::OauthStatus(..) => reqwest::Method::GET,
            Endpoint::Logout => reqwest::Method::DELETE,
            _ => reqwest::Method::POST,
        }
    }
}

fn valid_provider(provider: &str) -> Option<&'static str> {
    match provider {
        "google" => Some("google"),
        "apple" => Some("apple"),
        _ => None,
    }
}

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
    let url = format!("{}{}", base_url(), endpoint.path()?);
    let method = endpoint.method();
    let mut last = String::new();
    for attempt in 0..2 {
        if attempt > 0 {
            tokio::time::sleep(RETRY_DELAY).await;
        }
        let mut request = reqwest::Client::new()
            .request(method.clone(), &url)
            .header("Accept", "application/json")
            .timeout(REQUEST_TIMEOUT);
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
