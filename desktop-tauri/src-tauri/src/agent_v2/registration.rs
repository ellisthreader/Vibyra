//! `POST /api/agents/v2/runtimes`: binds this Mac + selected AI account. The
//! runner key comes back once, lives in the OS credential store the v1
//! runner uses, and is rotated by every re-registration.

use super::api::{send, ApiError};
use super::selection::Selection;
use crate::secret_store::SecretStore;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Registered {
    pub runtime_id: String,
    pub host_id: String,
    pub account_scope: String,
    pub selection: Selection,
    pub provider_version: String,
    /// What was declared; a change (e.g. Chrome installed) re-registers once.
    #[serde(default)]
    pub capabilities: Value,
}

impl Registered {
    /// Still the binding for this account, computer, selection and CLI build.
    pub fn matches(&self, scope: &str, host: &str, selection: &Selection, version: &str) -> bool {
        self.account_scope == scope
            && self.host_id == host
            && &self.selection == selection
            && self.provider_version == version
    }
}

pub fn capabilities(selection: &Selection) -> Value {
    if selection.controlled_tools() {
        json!({"controlledTools": true, "adapter": "claude-stream-json", "brokerOnly": true,
            "interrupt": true, "taskSteering": true, "preflight": "initialize+mcp_status", "computerTools": true,
            "browserTools": crate::agent_v2_browser::available(), "localMcp": true})
    } else {
        // Codex needs the code-mode JS host for any tool; Gemini is untested.
        json!({"controlledTools": false, "ready": false, "reason": "adapter_not_ready"})
    }
}

pub fn payload(host_id: &str, selection: &Selection, version: &str) -> Value {
    let version: String = version.chars().take(60).collect();
    json!({"hostId": host_id, "provider": selection.provider, "accountRef": selection.account,
        "model": selection.model, "effort": selection.effort,
        "providerVersion": if version.is_empty() { Value::Null } else { Value::String(version) },
        "capabilities": capabilities(selection)})
}

/// `true` when Agent V2 is on for this account (the runtimes list answers).
pub async fn enabled(base: &str, token: &str) -> Result<bool, ApiError> {
    match send(base, Some(token), None, Method::GET, "runtimes", None).await {
        Ok(_) => Ok(true),
        Err(error) if error.disabled() => Ok(false),
        // The backend this app talks to has not shipped the Agent V2 routes yet: same as off,
        // so the Mac asks once a minute instead of reporting an error every 30 seconds.
        Err(ApiError::Refused {
            status: 404, code, ..
        }) if code == "http_error" => Ok(false),
        Err(error) => Err(error),
    }
}

pub async fn register(base: &str, token: &str, body: Value) -> Result<(String, String), ApiError> {
    let value = send(
        base,
        Some(token),
        None,
        Method::POST,
        "runtimes",
        Some(body),
    )
    .await?
    .unwrap_or(Value::Null);
    let runtime = &value["runtime"];
    let id = runtime["id"]
        .as_str()
        .filter(|id| crate::agent_computer_access::looks_uuid(id));
    let key = runtime["runnerKey"].as_str().filter(|key| key.len() == 64);
    match (id, key) {
        (Some(id), Some(key)) => Ok((id.to_owned(), key.to_owned())),
        _ => Err(ApiError::Network(
            "The runtime registration was unreadable".into(),
        )),
    }
}

fn file(settings_dir: &Path) -> PathBuf {
    settings_dir.join("agent-v2-runtime.json")
}

fn secret_name(runtime_id: &str) -> String {
    format!("v2-{runtime_id}")
}

/// Saves the binding and its key; the previous binding's key is deleted.
pub fn store(settings_dir: &Path, registered: &Registered, key: &str) -> Result<(), String> {
    let previous = load_record(settings_dir);
    SecretStore.write_agent_runner_key(&secret_name(&registered.runtime_id), Some(key))?;
    let text = serde_json::to_string_pretty(registered).map_err(|e| e.to_string())?;
    std::fs::write(file(settings_dir), text)
        .map_err(|_| "Could not save the Agent runtime.".to_string())?;
    if let Some(old) = previous.filter(|old| old.runtime_id != registered.runtime_id) {
        let _ = SecretStore.write_agent_runner_key(&secret_name(&old.runtime_id), None);
    }
    Ok(())
}

fn load_record(settings_dir: &Path) -> Option<Registered> {
    serde_json::from_str(&std::fs::read_to_string(file(settings_dir)).ok()?).ok()
}

pub fn load(settings_dir: &Path) -> Option<(Registered, String)> {
    let record = load_record(settings_dir)?;
    let key = SecretStore
        .read_agent_runner_key(&secret_name(&record.runtime_id))
        .ok()
        .flatten()?;
    Some((record, key))
}

/// Forgets a binding the backend no longer accepts, so the next tick registers.
pub fn clear(settings_dir: &Path) {
    if let Some(old) = load_record(settings_dir) {
        let _ = SecretStore.write_agent_runner_key(&secret_name(&old.runtime_id), None);
    }
    let _ = std::fs::remove_file(file(settings_dir));
}

/// `claude --version` → `2.1.285`. Pinned in the binding so an upgrade
/// re-registers (and the adapter proof can be re-run).
pub fn provider_version(program: &Path) -> String {
    std::process::Command::new(program)
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .and_then(|text| text.split_whitespace().next().map(str::to_owned))
        .filter(|v| {
            v.len() <= 60
                && v.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
        })
        .unwrap_or_default()
}

#[cfg(test)]
#[path = "registration_tests.rs"]
mod tests;
