//! `vibyra-broker`: the stdio MCP server Claude Code gets as its only tool
//! source. It is this app binary started with [`FLAG`], so nothing beyond the
//! app itself has to be bundled.
//!
//! It exposes exactly the run's manifest tools and forwards each call to the
//! backend broker with the run's lease generation. Credentials for Gmail and
//! friends never reach this process; approvals happen server-side.

use super::api::RunnerApi;
use super::tools::{expose, ExposedTool};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::time::Duration;

#[path = "broker_call.rs"]
mod call;

pub const FLAG: &str = "--agent-v2-broker";
const PROTOCOL: &str = "2025-06-18";

/// Written by the runner beside (never inside) the model's working directory.
#[derive(Clone, Serialize, Deserialize)]
pub struct BrokerConfig {
    pub base: String,
    pub runtime_id: String,
    pub key: String,
    pub run_id: String,
    pub generation: u64,
    pub manifest: Value,
    /// Exists once the runner has proven the tool surface; calls wait for it.
    #[serde(default)]
    pub armed_path: Option<String>,
}

pub struct Broker {
    api: RunnerApi,
    run_id: String,
    generation: u64,
    tools: Vec<ExposedTool>,
    armed_path: Option<std::path::PathBuf>,
    /// Pause between approval checks while a write waits for the person.
    pub poll: Duration,
    /// How long a call waits for the runner to arm the broker.
    pub arm_wait: Duration,
    /// How long one write may wait before the model hears it is still pending.
    pub approval_wait: Duration,
}

impl Broker {
    pub fn new(config: BrokerConfig) -> Result<Self, String> {
        Ok(Self {
            tools: expose(&config.manifest)?,
            api: RunnerApi {
                base: config.base,
                runtime_id: config.runtime_id,
                key: config.key,
            },
            run_id: config.run_id,
            generation: config.generation,
            armed_path: config.armed_path.map(Into::into),
            poll: Duration::from_secs(3),
            arm_wait: Duration::from_secs(10),
            approval_wait: Duration::from_secs(16 * 60),
        })
    }

    /// One JSON-RPC message in, at most one response out.
    pub async fn handle(&self, message: &Value) -> Option<Value> {
        let id = message.get("id").cloned().filter(|id| !id.is_null())?;
        let method = message["method"].as_str().unwrap_or_default();
        let result = match method {
            "initialize" => json!({
                "protocolVersion": message["params"]["protocolVersion"].as_str().unwrap_or(PROTOCOL),
                "capabilities": {"tools": {"listChanged": false}},
                "serverInfo": {"name": super::tools::SERVER, "version": env!("CARGO_PKG_VERSION")}
            }),
            "ping" => json!({}),
            "tools/list" => {
                json!({"tools": self.tools.iter().map(ExposedTool::mcp_definition).collect::<Vec<_>>()})
            }
            "tools/call" => self.call(&message["params"]).await,
            _ => {
                return Some(json!({"jsonrpc": "2.0", "id": id,
                    "error": {"code": -32601, "message": "Method not found"}}))
            }
        };
        Some(json!({"jsonrpc": "2.0", "id": id, "result": result}))
    }

    async fn call(&self, params: &Value) -> Value {
        let name = params["name"].as_str().unwrap_or_default();
        // Refuse here too: never rely on the CLI's allowlist alone.
        let Some(tool) = self.tools.iter().find(|tool| tool.name == name) else {
            return text_result(
                &format!("The tool \"{name}\" is not available in this task."),
                true,
            );
        };
        if !self.armed().await {
            return text_result("Vibyra tools are not enabled for this session.", true);
        }
        let arguments = match &params["arguments"] {
            Value::Null => json!({}),
            value @ Value::Object(_) => value.clone(),
            _ => return text_result("Tool arguments must be an object.", true),
        };
        let call_id = params["_meta"]["claudecode/toolUseId"]
            .as_str()
            .filter(|id| valid_call_id(id))
            .map(str::to_owned)
            .unwrap_or_else(|| format!("broker-{}", uuid::Uuid::new_v4()));
        let body = json!({"generation": self.generation, "callId": call_id, "tool": tool.tool,
            "connectionId": tool.connection_id, "schemaRevision": tool.schema_revision, "arguments": arguments});
        call::forward(self, body).await
    }
}

impl Broker {
    /// The runner arms the broker only after the `system/init` gate passes.
    async fn armed(&self) -> bool {
        let Some(path) = &self.armed_path else {
            return true;
        };
        let started = std::time::Instant::now();
        while !path.exists() {
            if started.elapsed() > self.arm_wait {
                return false;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        true
    }
}

pub(crate) fn valid_call_id(id: &str) -> bool {
    (1..=100).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

pub(crate) fn text_result(text: &str, is_error: bool) -> Value {
    json!({"content": [{"type": "text", "text": text}], "isError": is_error})
}

/// `<app> --agent-v2-broker`: serve MCP on stdio until the CLI closes it.
pub fn handle_cli() -> Option<Result<&'static str, String>> {
    if std::env::args().nth(1).as_deref() != Some(FLAG) {
        return None;
    }
    if let Err(error) = serve() {
        eprintln!("vibyra-broker: {error}");
        std::process::exit(1);
    }
    std::process::exit(0);
}

/// Reads the run's configuration once and deletes the file at once: the session
/// and runner credentials in it live in this process's memory only from here on.
pub(crate) fn read_once(path: &std::path::Path) -> Result<BrokerConfig, String> {
    let text = std::fs::read_to_string(path).map_err(|_| "unreadable broker configuration")?;
    let _ = std::fs::remove_file(path);
    serde_json::from_str(&text).map_err(|_| "invalid broker configuration".to_string())
}

fn serve() -> Result<(), String> {
    let path = std::env::var("VIBYRA_BROKER_CONFIG").map_err(|_| "no broker configuration")?;
    let broker = Broker::new(read_once(std::path::Path::new(&path))?)?;
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let line = line.map_err(|_| "stdin closed")?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Value>(&line) {
            Ok(message) => tauri::async_runtime::block_on(broker.handle(&message)),
            Err(_) => Some(json!({"jsonrpc": "2.0", "id": null,
                "error": {"code": -32700, "message": "Parse error"}})),
        };
        if let Some(response) = response {
            writeln!(stdout, "{response}").map_err(|_| "stdout closed")?;
            stdout.flush().map_err(|_| "stdout closed")?;
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "broker_tests.rs"]
mod tests;
