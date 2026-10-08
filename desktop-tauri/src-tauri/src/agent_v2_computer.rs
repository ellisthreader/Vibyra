//! Agent V2 computer actions on the leased Mac (Phase 4).
//!
//! Beside a claimed run, poll `runner/{rt}/runs/{run}/computer` for actions the
//! backend broker approved (reads at once, writes after exact approval), claim
//! each with its fingerprint and lease generation, run it with the existing
//! Agent Computer primitives, and post the receipt. A stale generation is
//! fenced by the server; a write claimed by an earlier lease is never replayed.
//! Contract: `docs/agent-v2-api-contract.md` §6c.

use crate::agent_v2::api::{send, ApiError, RunnerApi};
use reqwest::Method;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;
use tauri::AppHandle;

#[path = "agent_v2_computer_exec.rs"]
mod exec;
#[path = "agent_v2_computer_map.rs"]
pub(crate) mod map;

const POLL: Duration = Duration::from_millis(1500);

#[derive(Clone)]
struct Lease {
    api: RunnerApi,
    run: String,
    /// The run's own teammate: the only one whose folder grants it may use.
    agent: String,
    generation: u64,
}

impl Lease {
    async fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, ApiError> {
        let path = format!(
            "runner/{}/runs/{}/computer{path}",
            self.api.runtime_id, self.run
        );
        let key = Some(self.api.key.as_str());
        Ok(send(&self.api.base, None, key, method, &path, body)
            .await?
            .unwrap_or(Value::Null))
    }

    async fn list(&self) -> Result<Vec<Value>, ApiError> {
        let body = self
            .request(
                Method::GET,
                &format!("?generation={}", self.generation),
                None,
            )
            .await?;
        Ok(body["actions"].as_array().cloned().unwrap_or_default())
    }

    async fn claim(&self, action: &Value) -> Result<Value, ApiError> {
        let body = json!({"generation": self.generation, "fingerprint": action["fingerprint"]});
        let path = format!("/{}/claim", action["id"].as_str().unwrap_or_default());
        Ok(self.request(Method::POST, &path, Some(body)).await?["action"].clone())
    }

    async fn receipt(&self, id: &str, result: &Value) -> Result<(), ApiError> {
        let body = json!({"generation": self.generation, "result": result});
        self.request(Method::POST, &format!("/{id}/receipt"), Some(body))
            .await
            .map(|_| ())
    }
}

/// Serves computer actions for one claimed run until aborted or fenced.
pub fn spawn(
    app: AppHandle,
    api: RunnerApi,
    claimed: &Value,
) -> tauri::async_runtime::JoinHandle<()> {
    let lease = Lease {
        api,
        run: claimed["id"].as_str().unwrap_or_default().to_owned(),
        agent: claimed["agentId"].as_str().unwrap_or_default().to_owned(),
        generation: claimed["generation"].as_u64().unwrap_or(0),
    };
    tauri::async_runtime::spawn(async move {
        if !map::plain_id(&lease.run) {
            return; // The run id goes into request paths: a plain UUID only.
        }
        // Receipts not yet acknowledged, re-posted instead of re-running anything.
        let mut unsent: HashMap<String, Value> = HashMap::new();
        loop {
            tokio::time::sleep(POLL).await;
            let actions = match lease.list().await {
                Ok(actions) => actions,
                Err(error) if error.fences() || error.code() == Some("run_not_found") => return,
                Err(_) => continue,
            };
            for action in actions {
                serve(&app, &lease, &action, &mut unsent).await;
            }
        }
    })
}

async fn serve(
    app: &AppHandle,
    lease: &Lease,
    action: &Value,
    unsent: &mut HashMap<String, Value>,
) {
    // Backend-supplied ids go into request paths and grant lookups: plain UUIDs only.
    let (Some(id), Some(op)) = (
        action["id"].as_str().filter(|id| map::plain_id(id)),
        action["tool"].as_str().and_then(map::map),
    ) else {
        return;
    };
    if !action["workspaceId"].as_str().is_some_and(map::plain_id) {
        return;
    }
    if map::claimed_by(action, lease.generation) {
        if let Some(result) = unsent.get(id) {
            if lease.receipt(id, result).await.is_ok() {
                unsent.remove(id);
            }
            return;
        }
        // A write claimed here whose run was interrupted is never re-run; a read is.
        if op.is_write() {
            return;
        }
    }
    if !map::claimed_by(action, lease.generation) {
        match lease.claim(action).await {
            Ok(claimed) if map::claimed_by(&claimed, lease.generation) => {}
            _ => return, // Refused, settled as unknown, or unreachable.
        }
    }
    // The V2 runner routes use the runner key alone. The existing Agent Computer
    // primitives still talk to the V1 workspace API with the account session and
    // this folder's own key; the session comes from the app at use, never from the
    // runner credential.
    let session = tauri::Manager::state::<crate::state::AppState>(app)
        .account
        .token();
    let result = match session {
        None => map::refusal("Sign in to Vibyra to run this action."),
        // The isolated shell-test VM is not part of this build: answer, never run.
        Some(_) if op == map::Op::Test => map::refusal(exec::UNSUPPORTED_TEST),
        Some(token) => {
            let (app, action, run) = (app.clone(), action.clone(), lease.run.clone());
            let agent = lease.agent.clone();
            tauri::async_runtime::spawn_blocking(move || {
                exec::run_blocking(&app, &token, op, &action, &run, &agent)
            })
            .await
            .unwrap_or_else(|_| map::refusal("The Mac could not complete this action."))
        }
    };
    // Only a lost response is retried; a refused receipt is the server's final word.
    if let Err(ApiError::Network(_)) = lease.receipt(id, &result).await {
        unsent.insert(id.to_owned(), result);
    }
}
