use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub use super::types_extra::{PreviewErrorCode, PreviewStep, ProjectKind, TargetInfo};

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PreviewDeviceHint {
    Phone,
    Tablet,
    Laptop,
    Desktop,
    Tv,
}

/// What a target opens: a page in the Preview frame, or an application window.
#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PreviewTargetKind {
    #[default]
    Web,
    Desktop,
}

impl PreviewTargetKind {
    /// Web targets serialize exactly as before `kind` existed: their JSON is
    /// part of every saved phone grant's fingerprint.
    pub fn is_web(&self) -> bool {
        *self == Self::Web
    }
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
    #[serde(skip_serializing_if = "PreviewTargetKind::is_web")]
    pub kind: PreviewTargetKind,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInspection {
    pub project_root: String,
    pub targets: Vec<PreviewTarget>,
    /// Per target id, for targets with something to say beyond the target itself.
    pub info: BTreeMap<String, TargetInfo>,
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

/// Where a desktop run is. `PreviewPhase` stays coarse (Starting covers
/// building and waiting for a window, Running means a window exists) so web
/// callers keep working unchanged.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DesktopStage {
    Building,
    WaitingForWindow,
    Ready,
    Exited,
    TimedOut,
}

/// A window owned by a desktop run's own process tree.
#[derive(Clone, Debug, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct PreviewWindow {
    pub pid: u32,
    pub id: u32,
    pub fingerprint: String,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<DesktopStage>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub windows: Vec<PreviewWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<PreviewStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<PreviewErrorCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    /// One plain sentence for the headline of a failure; `error` keeps the raw text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// The line of the project's own output that says why.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cause: Option<String>,
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
            stage: None,
            windows: Vec::new(),
            step: None,
            error_code: None,
            hint: None,
            summary: None,
            cause: None,
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
        /// Run first, one after another, when dependencies are missing.
        install: Vec<ProcessSpec>,
    },
    /// One process with no port: it is ready once it opens a window.
    Desktop {
        process: ProcessSpec,
    },
    Unsupported,
}

/// A command that detection did not offer but an owner approved for a
/// project: argv only, run in `relative_root` inside the project.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCommand {
    pub relative_root: String,
    pub argv: Vec<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct DetectedTarget {
    pub target: PreviewTarget,
    pub recipe: LaunchRecipe,
    pub info: TargetInfo,
}
