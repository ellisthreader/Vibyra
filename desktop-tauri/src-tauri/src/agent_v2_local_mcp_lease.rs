//! The lease a local MCP runner serves under, and what runs a call.

use crate::agent_v2::api::{send, ApiError, RunnerApi};
use reqwest::Method;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use vibyra_core::local_mcp::Supervisor;

/// What runs a call: the supervisor and the folder with the servers file.
#[derive(Clone)]
pub(crate) struct Engine {
    pub supervisor: Arc<Supervisor>,
    pub dir: PathBuf,
}

#[derive(Clone)]
pub(crate) struct Lease {
    pub api: RunnerApi,
    pub run: String,
    pub generation: u64,
    /// `guard.secrets` in the claim: sensitive files stay closed, results are redacted.
    pub secrets: bool,
}

impl Lease {
    pub(super) async fn request(
        &self,
        method: Method,
        suffix: &str,
        body: Option<Value>,
    ) -> Result<Value, ApiError> {
        let path = format!(
            "runner/{}/runs/{}/local-mcp{suffix}",
            self.api.runtime_id, self.run
        );
        let key = Some(self.api.key.as_str());
        Ok(send(&self.api.base, None, key, method, &path, body)
            .await?
            .unwrap_or(Value::Null))
    }

    pub(super) async fn list(&self) -> Result<Vec<Value>, ApiError> {
        let body = self
            .request(
                Method::GET,
                &format!("?generation={}", self.generation),
                None,
            )
            .await?;
        Ok(body["actions"].as_array().cloned().unwrap_or_default())
    }

    pub(super) async fn claim(&self, id: &str, body: Value) -> Result<Value, ApiError> {
        Ok(self
            .request(Method::POST, &format!("/{id}/claim"), Some(body))
            .await?["action"]
            .clone())
    }

    pub(super) async fn receipt(&self, id: &str, result: &Value) -> Result<(), ApiError> {
        let body = json!({"generation": self.generation, "result": result});
        self.request(Method::POST, &format!("/{id}/receipt"), Some(body))
            .await
            .map(|_| ())
    }
}
