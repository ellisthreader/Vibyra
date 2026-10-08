//! The account API of the sync contract over blocking reqwest. Retries 5xx and transport failures with
//! backoff; maps `{ok:false, code, message}` replies to `SyncError::Api`. Call from a worker thread.
mod access;
mod account;
mod logins;
mod parts;
mod transfer;
mod types;
pub use access::{CloudAccess, LOGIN_BLOCKED, PROJECT_NOT_ALLOWED};
pub use account::login;
pub use logins::{CloudLogin, CloudLogins};
pub use types::*;

use crate::error::{Result, SyncError};
use reqwest::blocking::{RequestBuilder, Response};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct RetryPolicy {
    /// Total tries per request (first + retries).
    pub attempts: u32,
    /// Delay before the second try; doubles each time.
    pub base_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        RetryPolicy {
            attempts: 4,
            base_delay: Duration::from_millis(500),
        }
    }
}

pub struct Client {
    base: String,
    token: String,
    http: reqwest::blocking::Client,
    pub retry: RetryPolicy,
    app_version: Option<String>,
}

/// The same rule as the desktop's `account_api::base_url`: https, or plain http on loopback.
pub fn check_base_url(url: &str) -> Result<String> {
    let url = url.trim().trim_end_matches('/').to_string();
    let loopback = url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost");
    if loopback || url.starts_with("https://") {
        Ok(url)
    } else {
        Err(SyncError::Invalid(
            "The account service address must be https.".into(),
        ))
    }
}

impl Client {
    pub fn new(base_url: &str, token: &str) -> Result<Client> {
        let http = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| SyncError::Network(crate::client::network_detail(e)))?;
        Ok(Client {
            base: check_base_url(base_url)?,
            token: token.to_string(),
            http,
            retry: RetryPolicy::default(),
            app_version: None,
        })
    }

    pub fn with_retry(mut self, retry: RetryPolicy) -> Client {
        self.retry = retry;
        self
    }

    /// Sent as `X-Vibyra-Desktop`, like the app's other account calls.
    pub fn with_app_version(mut self, version: &str) -> Client {
        self.app_version = Some(version.to_string());
        self
    }

    fn url(&self, path: &str) -> String {
        format!("{}/api/cloud-computer/sync{path}", self.base)
    }

    fn prepare(&self, b: RequestBuilder) -> RequestBuilder {
        let b = b
            .bearer_auth(&self.token)
            .header("Accept", "application/json");
        match &self.app_version {
            Some(v) => b.header("X-Vibyra-Desktop", v),
            None => b,
        }
    }

    /// Runs `build` up to `attempts` times, backing off on transport errors, 429 and 5xx.
    pub(crate) fn send(&self, build: impl Fn() -> Result<RequestBuilder>) -> Result<Response> {
        let mut delay = self.retry.base_delay;
        let mut last = SyncError::Network("The account service could not be reached.".into());
        for attempt in 0..self.retry.attempts.max(1) {
            if attempt > 0 {
                std::thread::sleep(delay);
                delay *= 2;
            }
            match self.prepare(build()?).send() {
                Ok(r) if r.status().is_server_error() || r.status().as_u16() == 429 => {
                    last = SyncError::Network(format!(
                        "The account service answered {}.",
                        r.status().as_u16()
                    ));
                }
                Ok(r) => return Ok(r),
                Err(e) => last = SyncError::Network(crate::client::network_detail(e)),
            }
        }
        Err(last)
    }

    /// A JSON request; success is `{ok:true,...}` and the whole body is returned.
    pub(crate) fn json(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value> {
        let url = self.url(path);
        let resp = self.send(|| {
            let b = self
                .http
                .request(method.clone(), &url)
                .timeout(Duration::from_secs(60));
            Ok(match &body {
                Some(v) => b.json(v),
                None => b,
            })
        })?;
        check(resp)
    }
}

/// Success body, or the typed error for a non-2xx reply.
pub(crate) fn check(resp: Response) -> Result<Value> {
    let status = resp.status().as_u16();
    let value: Value = resp.json().unwrap_or(Value::Null);
    if (200..300).contains(&status) && value.get("ok") != Some(&Value::Bool(false)) {
        return Ok(value);
    }
    let text = |k: &str| value.get(k).and_then(Value::as_str).map(str::to_string);
    let message = text("message")
        .or_else(|| text("error"))
        .unwrap_or_else(|| format!("The account service answered {status}."));
    match (status, text("code")) {
        (401, _) => Err(SyncError::Unauthorized(message)),
        (403, None) => Err(SyncError::Unauthorized(message)),
        (_, code) => Err(SyncError::Api {
            status,
            code: code.unwrap_or_else(|| "error".into()),
            message,
        }),
    }
}

/// A network failure in words a person can act on: reqwest's top line ("error sending request") plus its causes
/// (DNS lookup, connection refused, timeout, TLS), without the URL or any request contents.
pub(crate) fn network_detail(e: reqwest::Error) -> String {
    let e = e.without_url();
    let mut text = e.to_string();
    let mut source = std::error::Error::source(&e);
    while let Some(cause) = source {
        let next = cause.to_string();
        if !next.is_empty() && !text.contains(&next) {
            text.push_str(": ");
            text.push_str(&next);
        }
        source = cause.source();
    }
    if text.len() > 300 {
        text.truncate(300);
    }
    text
}
