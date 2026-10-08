//! Runs one claimed computer action with the existing Agent Computer
//! primitives: the Mac's own saved grant (account, Host identity, folder
//! identity, Keychain key) is rechecked under the grant lock before each one.

use super::map::{self, Op};
use crate::agent_computer_runner::execute;
use crate::agent_computer_store::{self, Grant};
use crate::agent_computer_tools;
use crate::secret_store::SecretStore;
use crate::state::AppState;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Manager};

pub(super) const UNSUPPORTED_TEST: &str =
    "Shell tests are not available in this version of Vibyra.";

/// Is this saved grant the one this run may use? The folder must be granted on
/// this Mac, to this account, to the run's own teammate (a backend that pointed a
/// run at another teammate's folder is refused here, F-18).
pub(super) fn grant_fits(
    g: &Grant,
    workspace_id: &str,
    agent_id: &str,
    scope: &str,
    host: &str,
) -> bool {
    !g.revoked
        && g.id == workspace_id
        && g.agent_id == agent_id
        && g.account_scope == scope
        && g.host_id == host
}

/// The Mac grant for `workspace_id` and its runner key, or why it cannot run here.
pub(super) fn local_grant(
    app: &AppHandle,
    workspace_id: &str,
    agent_id: &str,
) -> Result<(Grant, String), String> {
    if !crate::agent_computer_access::looks_uuid(workspace_id)
        || !crate::agent_computer_access::looks_uuid(agent_id)
    {
        return Err("This action names a folder the Mac cannot verify.".into());
    }
    let state = app.state::<AppState>();
    let scope = crate::agent_computer_access::account_scope(&state)?;
    let parent = state
        .settings_path
        .parent()
        .ok_or("No Vibyra settings directory")?;
    // Same identity call as the installed 0.8.x line; the Keychain variant is a one-way migration.
    let host = vibyra_host::host_identity_id(&parent.join("phone"))?;
    let grant = agent_computer_store::load(&agent_computer_store::path(&state.settings_path)?)?
        .into_iter()
        .find(|g| grant_fits(g, workspace_id, agent_id, &scope, &host))
        .ok_or("This teammate's folder is not granted on this Mac. Choose it again in Vibyra.")?;
    grant.validate_path()?;
    let key = SecretStore
        .read_agent_runner_key(&grant.id)?
        .ok_or("This Mac's folder grant has no key. Choose the folder again.")?;
    Ok((grant, key))
}

/// One Host Engine per grant, in a V2-only state directory so it never
/// contends for the V1 runner's journal lock.
fn engine(app: &AppHandle, grant: &Grant) -> Result<Arc<vibyra_engine::Engine>, String> {
    static ENGINES: OnceLock<Mutex<HashMap<String, Arc<vibyra_engine::Engine>>>> = OnceLock::new();
    let engines = ENGINES.get_or_init(Default::default);
    let key = format!("{}:{}", grant.id, grant.path.display());
    if let Some(engine) = engines.lock().map_err(|_| "engine cache")?.get(&key) {
        return Ok(engine.clone());
    }
    let state = app.state::<AppState>();
    let dir = state
        .settings_path
        .parent()
        .ok_or("No Vibyra settings directory")?
        .join("agent-computer-engine-v2");
    let engine = Arc::new(agent_computer_tools::open(grant, &dir)?);
    engines
        .lock()
        .map_err(|_| "engine cache")?
        .insert(key, engine.clone());
    Ok(engine)
}

/// Blocking: reads, edits and publish preparation. The VM shell test is not part of this
/// Vibyra build: it answers with a plain refusal receipt.
pub(super) fn run_blocking(
    app: &AppHandle,
    token: &str,
    op: Op,
    action: &Value,
    run_id: &str,
    agent_id: &str,
) -> Value {
    let workspace = action["workspaceId"].as_str().unwrap_or_default();
    let (grant, key) = match local_grant(app, workspace, agent_id) {
        Ok(pair) => pair,
        Err(error) => return map::refusal(error),
    };
    let request = map::v1_request(op, action, run_id);
    if op == Op::Publish {
        return map::publish_receipt(execute::prepare_publish(app, token, &key, &grant, &request));
    }
    let engine = match engine(app, &grant) {
        Ok(engine) => engine,
        Err(error) => return map::refusal(error),
    };
    let result = execute::execute_tool(app, token, &key, &grant, &engine, &request);
    if op != Op::Edit {
        return map::read_receipt(result);
    }
    let digest = agent_computer_tools::snapshot_for_publish(&grant)
        .ok()
        .and_then(|s| s["snapshotSha256"].as_str().map(str::to_owned));
    map::edit_receipt(result, digest)
}
