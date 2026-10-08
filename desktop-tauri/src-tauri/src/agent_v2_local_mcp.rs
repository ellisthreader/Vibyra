//! Agent V2 local MCP calls on the leased Mac (roadmap Part 6).
//!
//! Beside a claimed run, poll `runner/{rt}/runs/{run}/local-mcp` for calls the
//! broker approved (a read the person marked, or a write after exact approval),
//! re-check here that the server is still configured, switched on and the one the
//! backend means, claim with the lease generation, the fingerprint and the tools
//! the server lists right now, run the call on the server's own process and post
//! the receipt. A call claimed by an earlier lease is never replayed; a lost
//! answer becomes an unknown outcome. The model never sees the server: it is one
//! of the broker's tools. Contract: `docs/agent-v2-api-contract.md` §6g.

use crate::agent_v2::api::{ApiError, RunnerApi};
// `json`, `Arc` and `Supervisor` are used by the support and test submodules through `super::*`.
#[allow(unused_imports)]
use serde_json::{json, Value};
use std::collections::HashMap;
#[allow(unused_imports)]
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
#[allow(unused_imports)]
use vibyra_core::local_mcp::Supervisor;
use vibyra_core::local_mcp::{store, McpError, ServerSpec, ToolDef};

#[path = "agent_v2_local_mcp_guard.rs"]
mod guard;
#[path = "agent_v2_local_mcp_lease.rs"]
pub(crate) mod lease;
#[path = "agent_v2_local_mcp_map.rs"]
pub(crate) mod map;
#[cfg(test)]
#[path = "agent_v2_local_mcp_map_tests.rs"]
mod map_tests;
#[cfg(test)]
#[path = "agent_v2_local_mcp_serve_tests.rs"]
mod serve_tests;
#[cfg(test)]
#[path = "agent_v2_local_mcp_support.rs"]
mod support;
#[cfg(test)]
#[path = "agent_v2_local_mcp_tests.rs"]
mod tests;

use lease::{Engine, Lease};
use map::Job;
#[cfg(test)]
#[path = "agent_v2_local_mcp_live_support.rs"]
pub(crate) mod live_support;

const POLL: Duration = Duration::from_millis(1500);

/// Serves local MCP calls for one claimed run until aborted or fenced.
pub fn spawn(
    app: AppHandle,
    api: RunnerApi,
    claimed: &Value,
) -> tauri::async_runtime::JoinHandle<()> {
    let lease = Lease {
        api,
        run: claimed["id"].as_str().unwrap_or_default().to_owned(),
        generation: claimed["generation"].as_u64().unwrap_or(0),
        secrets: claimed["guard"]["secrets"] == true,
    };
    tauri::async_runtime::spawn(async move {
        let Some(dir) = crate::local_mcp_host::dir(&app) else {
            return;
        };
        if !crate::agent_computer_access::looks_uuid(&lease.run) {
            return; // The run id goes into request paths: a plain UUID only.
        }
        let engine = Engine {
            supervisor: crate::local_mcp_host::supervisor().clone(),
            dir,
        };
        let mut unsent: HashMap<String, Value> = HashMap::new();
        loop {
            tokio::time::sleep(POLL).await;
            let actions = match lease.list().await {
                Ok(actions) => actions,
                Err(error) if error.fences() || error.code() == Some("run_not_found") => return,
                Err(_) => continue,
            };
            for action in actions {
                serve(&engine, &lease, &action, &mut unsent).await;
            }
        }
    })
}

pub(crate) async fn serve(
    engine: &Engine,
    lease: &Lease,
    action: &Value,
    unsent: &mut HashMap<String, Value>,
) {
    let Some(id) = action["id"]
        .as_str()
        .filter(|id| crate::agent_computer_access::looks_uuid(id))
    else {
        return;
    };
    let Some(job) = map::job(action) else { return };
    if map::claimed_by(action, lease.generation) {
        if let Some(result) = unsent.get(id) {
            if lease.receipt(id, result).await.is_ok() {
                unsent.remove(id);
            }
            return;
        }
        if job.is_write {
            return; // Claimed here and interrupted: never run again; the next lease settles it unknown.
        }
    } else {
        let (body, proceed) = preflight(engine, lease, action, &job).await;
        match lease.claim(id, body).await {
            Ok(claimed) if proceed && map::claimed_by(&claimed, lease.generation) => {}
            _ => return, // Refused or settled by the backend, or unreachable: nothing runs.
        }
    }
    let result = run(engine, &job, lease.secrets).await;
    match lease.receipt(id, &result).await {
        Err(ApiError::Network(_)) => {
            unsent.insert(id.to_owned(), result);
        }
        // A result the server cannot record must not leave the action hanging.
        Err(ApiError::Refused {
            status: 413 | 422, ..
        }) => {
            let _ = lease.receipt(id, &map::unrecordable(job.is_write)).await;
        }
        _ => {}
    }
}

/// The server as configured on this Mac, if it is still the one the backend means and is on.
pub(crate) fn current_spec(
    dir: &std::path::Path,
    job: &Job,
) -> Result<ServerSpec, (&'static str, String)> {
    let spec = store::load(dir)
        .into_iter()
        .find(|s| s.id == job.local_id)
        .ok_or((
            "disabled",
            "This server was removed from this Mac.".to_owned(),
        ))?;
    if spec.connection_id.as_deref() != Some(job.connection_id.as_str()) {
        return Err((
            "server_changed",
            "This server was set up again on this Mac. Review it in Settings.".into(),
        ));
    }
    if !spec.enabled {
        return Err((
            "disabled",
            "This server is switched off on this Mac.".into(),
        ));
    }
    Ok(spec)
}

/// The claim body, and whether to go on: the live tools when the server is
/// reachable, otherwise a visible refusal (nothing was sent).
async fn preflight(engine: &Engine, lease: &Lease, action: &Value, job: &Job) -> (Value, bool) {
    let refuse = |reason: &str, why: &str| {
        (
            map::claim_unavailable(action, lease.generation, reason, why),
            false,
        )
    };
    let spec = match current_spec(&engine.dir, job) {
        Ok(spec) => spec,
        Err((reason, why)) => return refuse(reason, &why),
    };
    let supervisor = engine.supervisor.clone();
    let listed = tauri::async_runtime::spawn_blocking(move || supervisor.list_tools(&spec)).await;
    match listed {
        Ok(Ok(live)) => (
            map::claim_with(action, lease.generation, &live as &[ToolDef]),
            true,
        ),
        Ok(Err(error)) => refuse(error.reason(), &error.to_string()),
        Err(_) => refuse("unavailable", "The Mac could not reach the server."),
    }
}

async fn run(engine: &Engine, job: &Job, secrets: bool) -> Value {
    let (supervisor, dir, job) = (engine.supervisor.clone(), engine.dir.clone(), job.clone());
    let is_write = job.is_write;
    tauri::async_runtime::spawn_blocking(move || {
        let outcome = match current_spec(&dir, &job) {
            Ok(spec) => guard::call(&supervisor, &dir, &spec, &job, secrets),
            Err((_, why)) => Err(McpError::Invalid(why)),
        };
        map::receipt(outcome, job.is_write)
    })
    .await
    .unwrap_or_else(|_| map::unrecordable(is_write))
}
