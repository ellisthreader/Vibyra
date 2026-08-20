mod catalog;

pub use catalog::{builtin_agents, program_in_path, resolve_agents};

use serde::{Deserialize, Serialize};

use crate::pty::LaunchSpec;

/// A launchable terminal agent. Adding a new AI CLI is purely data:
/// either extend `builtin_agents()` or add a custom entry in settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSpec {
    pub id: String,
    pub name: String,
    /// Executable resolved via PATH (or an absolute path).
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<(String, String)>,
    /// UI accent colour hint (hex).
    #[serde(default)]
    pub accent: String,
    #[serde(default)]
    pub description: String,
    /// True for entries defined by the user in settings.
    #[serde(default)]
    pub custom: bool,
}

/// AgentSpec plus what only the native side can know: whether the
/// executable actually exists on this machine.
#[derive(Debug, Clone, Serialize)]
pub struct ResolvedAgent {
    #[serde(flatten)]
    pub spec: AgentSpec,
    pub installed: bool,
}

impl AgentSpec {
    pub fn launch_spec(&self, cwd: Option<String>, default_shell: Option<String>) -> LaunchSpec {
        if self.id == "shell" {
            return LaunchSpec::shell(default_shell, cwd);
        }
        LaunchSpec {
            program: self.program.clone(),
            args: self.args.clone(),
            env: self.env.clone(),
            env_remove: Vec::new(),
            cwd,
            rows: 30,
            cols: 100,
        }
    }
}
