use std::path::PathBuf;

use serde::Serialize;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PreviewDeviceHint {
    Phone,
    Tablet,
    Laptop,
    Desktop,
    Tv,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTarget {
    pub id: String,
    pub name: String,
    pub framework: String,
    pub relative_root: String,
    pub command: Option<String>,
    pub runnable: bool,
    pub reason: Option<String>,
    pub device_hint: PreviewDeviceHint,
    pub landscape: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInspection {
    pub project_root: String,
    pub targets: Vec<PreviewTarget>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PreviewPhase {
    Idle,
    Starting,
    Running,
    Failed,
    Stopped,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewStatus {
    pub phase: PreviewPhase,
    pub target_id: String,
    pub url: Option<String>,
    pub command: Option<String>,
    pub logs: Vec<String>,
    pub error: Option<String>,
}

impl PreviewStatus {
    pub(crate) fn idle(target_id: &str) -> Self {
        Self {
            phase: PreviewPhase::Idle,
            target_id: target_id.to_owned(),
            url: None,
            command: None,
            logs: Vec::new(),
            error: None,
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct ProcessSpec {
    pub label: String,
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub cwd: PathBuf,
}

#[derive(Clone, Debug)]
pub(crate) enum LaunchRecipe {
    Static {
        root: PathBuf,
        entry: PathBuf,
    },
    Processes {
        processes: Vec<ProcessSpec>,
        primary_index: usize,
    },
    Unsupported,
}

#[derive(Clone, Debug)]
pub(crate) struct DetectedTarget {
    pub target: PreviewTarget,
    pub recipe: LaunchRecipe,
}
