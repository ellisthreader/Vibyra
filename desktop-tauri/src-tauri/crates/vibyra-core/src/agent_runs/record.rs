use crate::agent_model::{Engine, PermissionMode};
use crate::agent_profiles::AgentPlace;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSpec {
    pub agent_name: String,
    pub engine: Engine,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub account_id: Option<String>,
    pub permission: PermissionMode,
    pub cwd: String,
    pub places: Vec<AgentPlace>,
    pub prompt: String,
    pub context: String,
    pub context_fingerprint: String,
    pub provider_version: String,
    pub timeout_ms: u64,
    pub max_tool_calls: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub id: String,
    pub account: String,
    pub chat_id: String,
    pub agent_id: Option<String>,
    pub status: RunStatus,
    pub spec: RunSpec,
    pub started_ms: i64,
    pub ended_ms: Option<i64>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RunStatus {
    Running,
    Waiting,
    Succeeded,
    Failed,
    Cancelled,
    Interrupted,
}

impl RunStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Waiting => "waiting",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }
    pub fn active(self) -> bool {
        matches!(self, Self::Running | Self::Waiting)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutcome {
    pub status: RunStatus,
    pub message: Option<String>,
}

impl RunOutcome {
    pub fn from_exit(exit: crate::error::CoreResult<crate::agent_runtime::TurnExit>) -> Self {
        use crate::agent_runtime::TurnExit;
        match exit {
            Ok(TurnExit::Completed) => Self {
                status: RunStatus::Succeeded,
                message: None,
            },
            Ok(TurnExit::Cancelled) => Self {
                status: RunStatus::Cancelled,
                message: Some("Stopped by the user.".into()),
            },
            Ok(TurnExit::Failed(message)) => Self {
                status: RunStatus::Failed,
                message: Some(message),
            },
            Err(error) => Self {
                status: RunStatus::Failed,
                message: Some(error.to_string()),
            },
        }
    }
}
