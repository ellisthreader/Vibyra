//! This fixed owner endpoint never accepts a caller-selected URL or method.
use crate::account_api;
use serde_json::Value;
use vibyra_host::RestrictionPage;
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Failure {
    Unauthorized,
    Retry,
}
pub(super) async fn fetch(
    token: &str,
    host: &str,
    after: u64,
    revision: Option<u64>,
) -> Result<RestrictionPage, Failure> {
    fetch_at(&account_api::base_url(), token, host, after, revision).await
}
async fn fetch_at(
    base: &str,
    token: &str,
    host: &str,
    after: u64,
    revision: Option<u64>,
) -> Result<RestrictionPage, Failure> {
    let mut request = crate::http_client::shared()
        .get(format!("{base}/api/remote/hosts/{host}/restrictions"))
        .bearer_auth(token)
        .header("Accept", "application/json")
        .query(&[("after", after)])
        .timeout(std::time::Duration::from_secs(10));
    if let Some(revision) = revision {
        request = request.query(&[("at", revision)]);
    }
    let mut response = request.send().await.map_err(|_| Failure::Retry)?;
    if matches!(response.status().as_u16(), 401 | 403) {
        return Err(Failure::Unauthorized);
    }
    if !response.status().is_success() {
        return Err(Failure::Retry);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| Failure::Retry)? {
        if bytes.len() + chunk.len() > 1_048_576 {
            return Err(Failure::Retry);
        }
        bytes.extend_from_slice(&chunk);
    }
    let reply: Value = serde_json::from_slice(&bytes).map_err(|_| Failure::Retry)?;
    if reply["ok"] != true {
        return Err(Failure::Retry);
    }
    serde_json::from_value(reply["control"].clone()).map_err(|_| Failure::Retry)
}

#[cfg(test)]
#[path = "restriction_fetch_tests.rs"]
mod tests;
