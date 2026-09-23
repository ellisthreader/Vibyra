use std::time::Duration;

use crate::account_api::{request, ApiError, Endpoint};

/// Starting a flow only stores short-lived backend state, so retrying a
/// temporary service failure cannot accidentally sign in twice.
pub(crate) async fn request_start(
    provider: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, ApiError> {
    for attempt in 0..3 {
        match request(Endpoint::OauthStart(provider), None, Some(body.clone())).await {
            Err(ApiError::Network(_)) if attempt < 2 => {
                tokio::time::sleep(Duration::from_secs(2)).await
            }
            outcome => return outcome,
        }
    }
    unreachable!("the final OAuth start attempt returns its outcome")
}
