//! Agent V2 runner protocol client (`docs/agent-v2-api-contract.md` §6).
//!
//! Every call after claim carries the lease `generation`. Refusals come back as
//! `{ok:false, code, error}`; callers branch on `code`, never on text.

use reqwest::Method;
use serde_json::{json, Value};

#[path = "api_send.rs"]
mod transport;
pub use transport::{send, ApiError};

/// A runner holds the runner key only: no account session ever reaches a run (F-03).
#[derive(Clone)]
pub struct RunnerApi {
    pub base: String,
    pub runtime_id: String,
    pub key: String,
}

impl RunnerApi {
    pub async fn claim_slot(&self, slot: usize) -> Result<Option<Value>, ApiError> {
        let body = self
            .call(Method::POST, "claim", Some(json!({"workerSlot": slot})))
            .await?;
        Ok(body
            .map(|value| value["run"].clone())
            .filter(Value::is_object))
    }

    async fn call(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<Option<Value>, ApiError> {
        let path = format!("runner/{}/{path}", self.runtime_id);
        send(&self.base, None, Some(&self.key), method, &path, body).await
    }

    async fn post(&self, path: &str, body: Value) -> Result<Value, ApiError> {
        Ok(self
            .call(Method::POST, path, Some(body))
            .await?
            .unwrap_or(Value::Null))
    }

    /// The claimed run, or `None` when there is nothing to do.
    #[allow(dead_code)] // Serial protocol remains available to compatibility fixtures.
    pub async fn claim(&self) -> Result<Option<Value>, ApiError> {
        let body = self.call(Method::POST, "claim", Some(json!({}))).await?;
        Ok(body
            .map(|value| value["run"].clone())
            .filter(Value::is_object))
    }

    pub async fn heartbeat(&self, run: &str, generation: u64) -> Result<Value, ApiError> {
        self.post(
            &format!("runs/{run}/heartbeat"),
            json!({"generation": generation}),
        )
        .await
    }

    pub async fn checkpoint(&self, run: &str, generation: u64) -> Result<(), ApiError> {
        self.post(
            &format!("runs/{run}/checkpoint"),
            json!({"generation": generation}),
        )
        .await
        .map(|_| ())
    }
    pub async fn events(
        &self,
        run: &str,
        generation: u64,
        events: &[(&str, String)],
    ) -> Result<(), ApiError> {
        let events: Vec<_> = events
            .iter()
            .map(|(kind, text)| json!({"type": kind, "text": text}))
            .collect();
        self.post(
            &format!("runs/{run}/events"),
            json!({"generation": generation, "events": events}),
        )
        .await
        .map(|_| ())
    }

    pub async fn call_tool(&self, run: &str, body: Value) -> Result<Value, ApiError> {
        Ok(self.post(&format!("runs/{run}/tools"), body).await?["action"].clone())
    }

    pub async fn action(
        &self,
        run: &str,
        generation: u64,
        action: &str,
    ) -> Result<Value, ApiError> {
        let path = format!("runs/{run}/actions/{action}?generation={generation}");
        Ok(self
            .call(Method::GET, &path, None)
            .await?
            .unwrap_or(Value::Null)["action"]
            .clone())
    }

    pub async fn complete(&self, run: &str, generation: u64, answer: &str) -> Result<(), ApiError> {
        self.post(
            &format!("runs/{run}/complete"),
            json!({"generation": generation, "answer": answer}),
        )
        .await
        .map(|_| ())
    }

    pub async fn fail(
        &self,
        run: &str,
        generation: u64,
        code: &str,
        reason: &str,
    ) -> Result<(), ApiError> {
        self.fail_until(run, generation, code, reason, None).await
    }

    /// `fail` with `resumeAt` (RFC 3339) for a `limits` pause.
    pub async fn fail_until(
        &self,
        run: &str,
        generation: u64,
        code: &str,
        reason: &str,
        resume_at: Option<i64>,
    ) -> Result<(), ApiError> {
        let reason: String = reason.chars().take(500).collect();
        let mut body = json!({"generation": generation, "code": code, "reason": reason});
        if let Some(at) = resume_at.and_then(|secs| chrono::DateTime::from_timestamp(secs, 0)) {
            body["resumeAt"] = Value::String(at.to_rfc3339());
        }
        self.post(&format!("runs/{run}/fail"), body)
            .await
            .map(|_| ())
    }
}
