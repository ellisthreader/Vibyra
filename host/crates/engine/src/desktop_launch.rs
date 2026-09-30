use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// Local embedding configuration. Never read from remote protocol parameters.
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConversationOptions {
    #[serde(default)]
    pub provider: Option<String>,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub full_access: bool,
    pub worktrees_root: Option<PathBuf>,
    pub safe_snapshot_fingerprint: Option<String>,
}
impl DesktopConversationOptions {
    pub(crate) fn prepare(&self, root: &Path) -> Result<(PathBuf, Value), String> {
        if self.model.as_ref().is_some_and(|m| {
            m.is_empty()
                || m.len() > 200
                || !m
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || ".-_/:[]".contains(c))
        }) {
            return Err("Invalid model identifier".into());
        }
        if self.reasoning_effort.as_deref().is_some_and(|e| {
            ![
                "none",
                "minimal",
                "low",
                "medium",
                "high",
                "xhigh",
                "max",
                "ultra",
                "ultracode",
            ]
            .contains(&e)
        }) {
            return Err("Invalid reasoning effort".into());
        }
        let cwd = match &self.worktrees_root {
            Some(worktrees) => vibyra_core::workspace::prepare_safe_workspace(
                root,
                worktrees,
                self.safe_snapshot_fingerprint.as_deref(),
            )
            .map_err(|e| e.to_string())?,
            None => root.to_owned(),
        };
        let cwd = std::fs::canonicalize(cwd).map_err(|e| e.to_string())?;
        let mut params = json!({"cwd":cwd,"approvalPolicy":if self.full_access {"never"} else {"on-request"},
            "sandbox":if self.full_access {"danger-full-access"} else {"workspace-write"}});
        if let Some(model) = &self.model {
            params["model"] = json!(model);
        }
        if let Some(effort) = &self.reasoning_effort {
            params["config"] = json!({"model_reasoning_effort":effort});
        }
        Ok((cwd, params))
    }
}
impl crate::Engine {
    pub fn create_desktop_conversation(
        &self,
        params: Value,
        options: DesktopConversationOptions,
    ) -> Result<Value, String> {
        self.create_configured_conversation("desktop", &params, Some(options))
    }
}
