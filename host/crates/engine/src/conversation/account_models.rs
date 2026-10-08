use super::{provider_runtime, runtime::Runtime};
use crate::{embedded::ConversationLaunch, Engine};
use serde_json::{json, Value};
use std::path::PathBuf;

impl Engine {
    /// Local account discovery only: initialize the CLI, never start a thread or submit a prompt.
    pub fn account_models(
        provider: String,
        environment: Vec<(String, String)>,
    ) -> Result<Value, String> {
        let key = match provider.as_str() {
            "codex" => "CODEX_HOME",
            "claude" => "CLAUDE_CONFIG_DIR",
            "gemini" => "GEMINI_CLI_HOME",
            _ => return Err("Unsupported conversation provider".into()),
        };
        if environment.iter().any(|(name, _)| name != key) {
            return Err("Only the selected provider account directory may be configured".into());
        }
        let launch = ConversationLaunch {
            program: PathBuf::from(&provider),
            provider: provider.clone(),
            environment,
            account: true,
        };
        let root = std::env::temp_dir();
        let runtime = if provider == "codex" {
            Runtime::spawn(&root, &launch, |_| {})?
        } else {
            provider_runtime::spawn(&root, &provider, &launch, |_| {})?
        };
        let result = runtime.request("model/list", json!({"limit":100,"includeHidden":false}));
        runtime.stop();
        let result = result.map_err(|error| error.message)?;
        if result["data"].as_array().is_none_or(|rows| rows.is_empty())
            || !result["nextCursor"].is_null()
        {
            return Err("The account did not return a complete model catalogue".into());
        }
        Ok(result)
    }
}
