//! Agent V2 browser actions on the leased Mac (Phase 7, rebuild Stage 4).
//!
//! Beside a claimed run, poll `runner/{rt}/runs/{run}/browser` for actions
//! the broker approved (reads at once, `browser_submit` after exact
//! approval), claim each with its fingerprint and lease generation, run it
//! in the teammate's private Chrome profile and post the receipt. Engine:
//! the system Chrome/Chromium over CDP (no bundled browser or Node), a
//! loopback filtering proxy for every connection, one controller per
//! profile. Contract: `docs/agent-v2-api-contract.md` §6e.

use crate::agent_v2::api::{send, ApiError, RunnerApi};
use reqwest::Method;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;

#[path = "agent_v2_browser_actions.rs"]
mod actions;
#[path = "agent_v2_browser_address.rs"]
mod address;
#[path = "agent_v2_browser_cdp.rs"]
mod cdp;
#[path = "agent_v2_browser_chrome.rs"]
mod chrome;
#[path = "agent_v2_browser_events.rs"]
mod events;
#[path = "agent_v2_browser_exec.rs"]
mod exec;
#[path = "agent_v2_browser_input.rs"]
mod input;
#[path = "agent_v2_browser_pipe.rs"]
mod pipe;
#[path = "agent_v2_browser_policy.rs"]
pub(crate) mod policy;
#[path = "agent_v2_browser_proxy.rs"]
mod proxy;
#[path = "agent_v2_browser_sent.rs"]
mod sent;
#[path = "agent_v2_browser_session.rs"]
pub(crate) mod session;
#[path = "agent_v2_browser_setup.rs"]
mod setup;
#[path = "agent_v2_browser_submit.rs"]
mod submit;
#[path = "agent_v2_browser_takeover.rs"]
pub(crate) mod takeover;
#[cfg(test)]
#[path = "agent_v2_browser_tests.rs"]
mod tests;
#[path = "agent_v2_browser_url.rs"]
pub(crate) mod url_clean;

use exec::{execute, receipt};
use session::{refuse, Refusal, Session};

const POLL: Duration = Duration::from_millis(1500);
const TAKEOVER_LIMIT: Duration = Duration::from_secs(15 * 60);

/// Registration advertises `browserTools` only when a Chromium browser exists here.
pub fn available() -> bool {
    chrome::find().is_some()
}

struct Holder {
    connection: String,
    session: Session,
}

type Slot = Arc<Mutex<Option<Holder>>>;

/// Serves browser actions for one claimed run until aborted or fenced; the
/// browser (and its profile lease) closes with the run.
pub fn spawn(
    app: AppHandle,
    api: RunnerApi,
    claimed: &Value,
) -> tauri::async_runtime::JoinHandle<()> {
    let run = claimed["id"].as_str().unwrap_or_default().to_owned();
    let generation = claimed["generation"].as_u64().unwrap_or(0);
    tauri::async_runtime::spawn(async move {
        // Ids go into request paths: only plain UUIDs (never a backend-supplied path).
        if !crate::agent_computer_access::looks_uuid(&run) {
            return;
        }
        let slot: Slot = Arc::default();
        let _end = EndTakeover(app.clone(), run.clone());
        let path = |suffix: &str| format!("runner/{}/runs/{run}/browser{suffix}", api.runtime_id);
        let call = |method: Method, suffix: String, body: Option<Value>| {
            let (api, path) = (api.clone(), path(&suffix));
            async move { send(&api.base, None, Some(api.key.as_str()), method, &path, body).await }
        };
        let mut unsent: Vec<(String, Value)> = Vec::new();
        loop {
            tokio::time::sleep(POLL).await;
            for (id, result) in std::mem::take(&mut unsent) {
                let body = json!({"generation": generation, "result": result});
                match call(Method::POST, format!("/{id}/receipt"), Some(body)).await {
                    Err(error) if transient(&error) => unsent.push((id, result)),
                    _ => {}
                }
            }
            let actions = match call(Method::GET, format!("?generation={generation}"), None).await {
                Ok(body) => body.unwrap_or(Value::Null)["actions"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default(),
                Err(error) if error.fences() || error.code() == Some("run_not_found") => return,
                Err(_) => continue,
            };
            for action in actions {
                let Some(id) = action["id"]
                    .as_str()
                    .filter(|id| crate::agent_computer_access::looks_uuid(id))
                    .map(str::to_owned)
                else {
                    continue;
                };
                let mine = action["claimedGeneration"].as_u64() == Some(generation)
                    && action["state"] == "dispatching";
                if mine && (action["kind"] == "write" || unsent.iter().any(|(u, _)| *u == id)) {
                    continue; // Never re-run a claimed submit; a pending receipt is re-posted above.
                }
                if !mine {
                    let body =
                        json!({"generation": generation, "fingerprint": action["fingerprint"]});
                    match call(Method::POST, format!("/{id}/claim"), Some(body)).await {
                        Ok(Some(c)) if c["action"]["state"] == "dispatching" => {}
                        _ => continue,
                    }
                }
                let (app, slot, run, job) =
                    (app.clone(), slot.clone(), run.clone(), action.clone());
                let result =
                    tauri::async_runtime::spawn_blocking(move || execute(&app, &slot, &run, &job))
                        .await
                        .unwrap_or_else(|_| {
                            receipt(Err(refuse("unavailable", "The browser stopped.")))
                        });
                let body = json!({"generation": generation, "result": result});
                match call(Method::POST, format!("/{id}/receipt"), Some(body)).await {
                    // A lost or overloaded answer is retried: the truthful receipt can still land.
                    Err(error) if transient(&error) => unsent.push((id, result)),
                    // A result the server cannot accept (422) must not leave the action hanging.
                    Err(ApiError::Refused {
                        status: 413 | 422, ..
                    }) => {
                        let body =
                            json!({"generation": generation, "result": unrecordable(&action)});
                        let _ = call(Method::POST, format!("/{id}/receipt"), Some(body)).await;
                    }
                    _ => {}
                }
            }
        }
    })
}

/// A receipt post that may succeed if tried again.
fn transient(error: &ApiError) -> bool {
    matches!(
        error,
        ApiError::Network(_)
            | ApiError::Refused {
                status: 408 | 429 | 500..=599,
                ..
            }
    )
}

/// The receipt for a result the server refused to record (422, 413). A submit may well have
/// been sent (only its report was refused), so it is an unknown outcome and never
/// repeated; anything else is a definite refusal.
pub(crate) fn unrecordable(action: &Value) -> Value {
    if action["tool"] == "browser_submit" || action["kind"] == "write" {
        return receipt(Err(Refusal {
            reason: "unavailable",
            message: "The form may have been sent, but its result could not be recorded.".into(),
            unknown: true,
        }));
    }
    receipt(Err(refuse(
        "refused",
        "The browser result could not be recorded.",
    )))
}

/// Ends a pending takeover when the run stops, so its browser closes promptly.
struct EndTakeover(AppHandle, String);

impl Drop for EndTakeover {
    fn drop(&mut self) {
        takeover::end(Some(&self.0), &self.1);
    }
}
