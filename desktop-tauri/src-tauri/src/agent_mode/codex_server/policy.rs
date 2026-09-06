use serde_json::{json, Map, Value};
use vibyra_core::{agent_model::PlaceAccess, agent_runs::AgentRun};

/// Each task selects a fresh profile, preventing user config from widening it by name.
pub fn config(task: &AgentRun, loaded: &Value, executables: &[std::path::PathBuf]) -> Value {
    let name = profile(task);
    let mut filesystem = Map::new();
    filesystem.insert(":root".into(), json!("deny"));
    filesystem.insert(":minimal".into(), json!("read"));
    // Linux's inner sandbox re-executes the running provider. npm may have
    // installed that exact binary outside the minimal system runtime roots.
    for executable in executables {
        filesystem.insert(executable.to_string_lossy().into_owned(), json!("read"));
    }
    for place in &task.spec.places {
        let write = task.spec.permission.writes() && place.access == PlaceAccess::ReadWrite;
        filesystem.insert(
            place.path.clone(),
            json!(if write { "write" } else { "read" }),
        );
        for private in [".git", ".codex", ".claude"] {
            filesystem.insert(
                std::path::Path::new(&place.path)
                    .join(private)
                    .to_string_lossy()
                    .into_owned(),
                json!("read"),
            );
        }
    }
    for secret in [
        "~/.ssh",
        "~/.aws",
        "~/.codex/auth.json",
        "~/.claude/.credentials.json",
    ] {
        filesystem.insert(secret.into(), json!("deny"));
    }
    let mut config = Map::new();
    config.insert(
        format!("permissions.{name}.filesystem"),
        Value::Object(filesystem),
    );
    config.insert(format!("permissions.{name}.network.enabled"), json!(false));
    config.insert("default_permissions".into(), json!(name));
    config.insert("web_search".into(), json!("disabled"));
    // Codex 0.153.4 retires `untrusted` in config files, but retains the
    // structured thread/turn override. Those requests select `untrusted`
    // explicitly and verify the returned policy before allowing execution.
    config.insert("approval_policy".into(), json!("on-request"));
    config.insert("approvals_reviewer".into(), json!("user"));
    if let Some(effort) = &task.spec.effort {
        config.insert("model_reasoning_effort".into(), json!(effort));
    }
    for feature in [
        "apps",
        "plugins",
        "multi_agent",
        "js_repl",
        "computer_use",
        "browser_use",
    ] {
        config.insert(format!("features.{feature}"), json!(false));
    }
    // MCP tools run outside the command sandbox. Only Vibyra-owned tools may be exposed.
    if let Some(servers) = loaded
        .pointer("/config/mcp_servers")
        .and_then(Value::as_object)
    {
        for name in servers.keys() {
            config.insert(format!("mcp_servers.{name}.enabled"), json!(false));
        }
    }
    Value::Object(config)
}
pub fn profile(task: &AgentRun) -> String {
    format!("vibyra_{}", task.id.replace('-', "_"))
}

pub fn verify(response: &Value, expected: &str) -> Result<(), String> {
    if response
        .pointer("/activePermissionProfile/id")
        .and_then(Value::as_str)
        != Some(expected)
    {
        return Err("Codex did not apply this task's permission profile. Update Codex and remove conflicting legacy sandbox settings before retrying.".into());
    }
    if response.get("approvalPolicy").and_then(Value::as_str) != Some("untrusted") {
        return Err("Codex did not apply Vibyra's approval policy.".into());
    }
    Ok(())
}
