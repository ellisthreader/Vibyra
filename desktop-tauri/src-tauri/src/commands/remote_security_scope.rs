//! Scope every cloud security response to the native account and this Host.
use crate::{account_api, state::AppState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use vibyra_host::RegistrationProof;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scope {
    pub account_scope: String,
    pub host_id: String,
}

pub struct Context {
    pub scope: Scope,
    pub token: String,
    pub proof: Option<RegistrationProof>,
}
impl Context {
    pub fn capture(state: &AppState, expected: Option<&Scope>) -> Result<Self, String> {
        let token = state
            .account
            .token()
            .ok_or("Sign in to manage remote access.")?;
        let profile = state
            .account
            .snapshot()
            .profile
            .ok_or("Sign in to manage remote access.")?;
        let phone = state.phone.lock();
        let host = phone.host().ok();
        let scope = Scope {
            account_scope: profile.welcome_key,
            host_id: host.map(|h| h.id()).unwrap_or_default(),
        };
        if expected.is_some_and(|value| {
            value.account_scope != scope.account_scope || value.host_id != scope.host_id
        }) {
            return Err("The account or computer changed. Open remote access again.".into());
        }
        Ok(Self {
            scope,
            token,
            proof: host.map(|h| h.registration_proof()),
        })
    }
    pub fn check(&self, state: &AppState) -> Result<(), String> {
        let current = Self::capture(state, None)?;
        self.ensure_current(&current.scope, &current.token)
    }
    fn ensure_current(&self, current: &Scope, token: &str) -> Result<(), String> {
        self.ensure_account(current, token)?;
        if current.host_id != self.scope.host_id {
            return Err("The account or computer changed. Open remote access again.".into());
        }
        Ok(())
    }
    fn ensure_account(&self, current: &Scope, token: &str) -> Result<(), String> {
        if current.account_scope != self.scope.account_scope || token != self.token {
            return Err("The account session changed. Try again.".into());
        }
        Ok(())
    }
    fn check_bound(&self, state: &AppState, require_host: bool) -> Result<(), String> {
        if require_host {
            return self.check(state);
        }
        let current = Self::capture(state, None)?;
        self.ensure_account(&current.scope, &current.token)
    }
    pub async fn request(
        &self,
        state: &AppState,
        method: reqwest::Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, String> {
        self.request_bound(state, method, path, body, true).await
    }
    /// The one account-wide operation allowed after the local Host is stopped.
    /// Both account and bearer must still match across every network await.
    pub async fn disable_all_cloud(&self, state: &AppState) -> Result<Value, String> {
        self.request_bound(
            state,
            reqwest::Method::POST,
            "/api/remote/disable",
            Some(serde_json::json!({})),
            false,
        )
        .await
    }
    async fn request_bound(
        &self,
        state: &AppState,
        method: reqwest::Method,
        path: &str,
        body: Option<Value>,
        require_host: bool,
    ) -> Result<Value, String> {
        self.check_bound(state, require_host)?;
        let mut request = crate::http_client::shared()
            .request(method, format!("{}{}", account_api::base_url(), path))
            .bearer_auth(&self.token)
            .header("Accept", "application/json")
            .timeout(std::time::Duration::from_secs(15));
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request
            .send()
            .await
            .map_err(|_| "Remote security could not reach Vibyra Cloud.")?;
        self.check_bound(state, require_host)?;
        let status = response.status().as_u16();
        let mut response = response;
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Remote security response was interrupted.")?
        {
            self.check_bound(state, require_host)?;
            if bytes.len() + chunk.len() > 1_048_576 {
                return Err("Remote security response is too large.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        self.check_bound(state, require_host)?;
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| "Invalid remote security response.")?;
        if !(200..300).contains(&status) || value["ok"] != true {
            return Err(account_api::error_detail(&value, status));
        }
        Ok(value)
    }
}

#[cfg(test)]
#[path = "remote_security_scope_tests.rs"]
mod tests;
