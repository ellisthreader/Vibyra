use crate::agent_computer_store::{self, Grant};
use crate::agent_computer_tools;
use crate::secret_store::SecretStore;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// Rechecks the local record under the same lock used by revoke and folder changes.
pub(super) fn execute_tool(
    app: &AppHandle,
    token: &str,
    key: &str,
    grant: &Grant,
    engine: &vibyra_engine::Engine,
    request: &Value,
) -> Value {
    let operation = request["operation"].as_str().unwrap_or("");
    let state = app.state::<AppState>();
    let _guard = state.agent_computer_write.lock();
    let authorized = state.account.token().as_deref() == Some(token)
        && state
            .account
            .snapshot()
            .profile
            .is_some_and(|profile| profile.welcome_key == grant.account_scope)
        && agent_computer_store::path(&state.settings_path)
            .ok()
            .and_then(|path| agent_computer_store::load(&path).ok())
            .is_some_and(|grants| grants.iter().any(|saved| !saved.revoked && saved == grant))
        && SecretStore
            .read_agent_runner_key(&grant.id)
            .ok()
            .flatten()
            .as_deref()
            == Some(key);
    if !authorized {
        return json!({"error":"This computer project grant was removed or changed."});
    }
    if operation == "write_file" {
        agent_computer_tools::edit(grant, engine, request)
    } else {
        agent_computer_tools::read(grant, engine, operation, &request["arguments"])
    }
}
