use crate::Engine;
use serde_json::Value;
use std::sync::Arc;
/// Read-only integration: no grants, application launches or input.
pub type PreviewStatusProvider = Arc<dyn Fn(&str, &str) -> Result<Value, String> + Send + Sync>;

/// An agent's request to run its project's desktop app on the computer,
/// outside its sandbox. The host decides what runs; the agent only names it.
#[derive(Clone, Debug, Default)]
pub struct RunRequest {
    /// The device controlling the chat, or "desktop".
    pub device: String,
    pub project: String,
    /// The chat's working folder: the project root or one of its worktrees.
    pub root: Option<String>,
    pub target: Option<String>,
    pub command: Option<String>,
    /// Present once the owner approved the plan the host returned.
    pub approve_token: Option<String>,
}

#[derive(Clone, Debug)]
pub enum RunOutcome {
    Started(Value),
    /// Nothing runs until the owner approves this exact command.
    NeedsApproval {
        token: String,
        name: String,
        command: String,
        cwd: String,
        body: Option<String>,
    },
}

/// Launches only commands the owner approved; see [`RunRequest`].
pub type PreviewRunProvider = Arc<dyn Fn(&RunRequest) -> Result<RunOutcome, String> + Send + Sync>;

impl Engine {
    pub fn set_preview_status_provider(&self, provider: PreviewStatusProvider) {
        self.shared.lock().preview_status = Some(provider);
    }
    pub fn set_preview_run_provider(&self, provider: PreviewRunProvider) {
        self.shared.lock().preview_run = Some(provider);
    }
}
