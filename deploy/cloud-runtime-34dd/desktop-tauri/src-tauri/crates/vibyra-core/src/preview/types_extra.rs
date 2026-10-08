use serde::Serialize;

/// What a project is, for the badge on its icon. Kept out of `PreviewTarget`
/// itself: that JSON is part of every saved phone grant's fingerprint.
#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectKind {
    #[default]
    Website,
    Mobile,
    Api,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TargetInfo {
    pub project: ProjectKind,
    /// Dependencies are missing; Run installs them first.
    pub needs_install: bool,
    /// The exact install command Run would use, for disclosure.
    pub install_command: Option<String>,
}

/// Where a web run is. `PreviewPhase` stays Starting throughout, so older
/// callers keep working; this says which part of starting it is.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreviewStep {
    Installing,
    Starting,
    Waiting,
}

/// Why a run failed, classified from the process and its output so every
/// surface can offer the same fix.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreviewErrorCode {
    MissingDependencies,
    InstallFailed,
    ToolNotFound,
    PortInUse,
    MissingWebSupport,
    NodeVersion,
    Timeout,
    Exited,
}
