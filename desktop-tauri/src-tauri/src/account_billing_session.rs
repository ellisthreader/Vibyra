//! An action keeps the session captured before its first asynchronous step.
use crate::account_api::{error_detail, request_raw, ApiError, Endpoint};
use crate::account_session::AccountSessionManager;
use serde_json::Value;

pub(super) struct BillingSession<'a> {
    account: &'a AccountSessionManager,
    token: String,
}

impl<'a> BillingSession<'a> {
    pub(super) fn capture(account: &'a AccountSessionManager) -> Result<Self, String> {
        let token = account
            .token()
            .ok_or_else(|| "You are not signed in.".to_owned())?;
        Ok(Self { account, token })
    }

    pub(super) async fn request(
        &self,
        endpoint: Endpoint<'_>,
        body: Option<Value>,
    ) -> Result<Value, String> {
        self.request_with(|| request_raw(endpoint, Some(&self.token), body))
            .await
    }

    async fn request_with<F>(&self, send: impl FnOnce() -> F) -> Result<Value, String>
    where
        F: std::future::Future<Output = Result<(u16, Value), ApiError>>,
    {
        self.account.with_token(&self.token, || ())?;
        self.finish(send().await)
    }

    pub(super) fn finish(&self, result: Result<(u16, Value), ApiError>) -> Result<Value, String> {
        self.account.with_token(&self.token, || {
            let (status, body) = result.map_err(|error| error.message().to_owned())?;
            if (200..300).contains(&status) {
                return Ok(body);
            }
            // Checkout can reject a valid unverified account with403. Billing
            // errors never prove that /api/session invalidated the credential.
            Err(error_detail(&body, status))
        })?
    }

    pub(super) fn perform<T>(
        &self,
        action: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        self.account.with_token(&self.token, action)?
    }
}

#[cfg(test)]
#[path = "account_billing_session_tests.rs"]
mod tests;
