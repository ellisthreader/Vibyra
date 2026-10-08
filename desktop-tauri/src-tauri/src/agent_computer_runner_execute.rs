use crate::agent_computer_runner_auth::authorized;
use crate::agent_computer_store::Grant;
use crate::agent_computer_tools;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// Rechecks the local record under the same lock used by revoke and folder changes.
pub(crate) fn execute_tool(
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
    if !authorized(app, token, key, grant) {
        return json!({"error":"This computer project grant was removed or changed."});
    }
    if operation == "write_file" {
        agent_computer_tools::edit(grant, engine, request)
    } else {
        agent_computer_tools::read(grant, engine, operation, &request["arguments"])
    }
}

/// Holds the local grant lock while building the exact byte upload.
pub(crate) fn prepare_publish(
    app: &AppHandle,
    token: &str,
    key: &str,
    grant: &Grant,
    request: &Value,
) -> Result<Value, String> {
    let state = app.state::<AppState>();
    let _guard = state.agent_computer_write.lock();
    if !authorized(app, token, key, grant) {
        return Err("This computer project grant was removed or changed.".into());
    }
    agent_computer_tools::upload_for_publish(grant, &request["arguments"]["snapshot"])
}
