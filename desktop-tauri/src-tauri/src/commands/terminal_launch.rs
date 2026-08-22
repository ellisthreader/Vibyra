use std::path::Path;

use serde::Deserialize;
use vibyra_core::pty::LaunchSpec;
use vibyra_core::CoreError;

use super::terminal_args::{
    add_full_access, add_reasoning_effort, add_resume, pin_session, validate_model,
    validate_session_id,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalRequest {
    pub agent_id: String,
    pub cwd: Option<String>,
    pub rows: Option<u16>,
    pub cols: Option<u16>,
    pub model: Option<String>,
    pub permission_mode: Option<PermissionMode>,
    pub reasoning_effort: Option<String>,
    pub workspace_mode: Option<String>,
    pub safe_snapshot_fingerprint: Option<String>,
    /// Set when a suspended pane is being resumed: the agent is asked to pick
    /// up the conversation it was in rather than start an empty one.
    pub resume: Option<bool>,
    /// The conversation this pane owns, for agents that accept one. Pinned at
    /// launch and named again on resume, so panes never share a conversation.
    pub agent_session_id: Option<String>,
    /// Which provider account to run as. `None` means the first one, which is
    /// the CLI's own folder and the only account most installs have.
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PermissionMode {
    Standard,
    Full,
}

pub fn canonical_directory(path: Option<String>) -> Result<Option<String>, CoreError> {
    let Some(path) = path else { return Ok(None) };
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|error| CoreError::InvalidPath(format!("{path}: {error}")))?;
    if !canonical.is_dir() {
        return Err(CoreError::InvalidPath(format!("not a directory: {path}")));
    }
    Ok(Some(canonical.to_string_lossy().into_owned()))
}

pub fn configure_launch(
    spec: &mut LaunchSpec,
    request: &CreateTerminalRequest,
) -> Result<(), CoreError> {
    let session = request
        .agent_session_id
        .as_deref()
        .map(validate_session_id)
        .transpose()?;
    // First, because `codex resume` is a *subcommand* and its options are
    // parsed after it — `--model` and the sandbox flag below are accepted
    // there, but only once the verb has been seen.
    if request.resume.unwrap_or(false) {
        add_resume(&request.agent_id, session, &mut spec.args);
    } else if let Some(session) = session {
        pin_session(&request.agent_id, session, &mut spec.args);
    }
    if let Some(model) = request.model.as_deref() {
        validate_model(model)?;
        if request.agent_id == "shell" || request.agent_id == "ssh" {
            return Err(invalid("plain terminals cannot receive a model"));
        }
        spec.args.extend(["--model".into(), model.into()]);
    }
    if request.permission_mode == Some(PermissionMode::Full) {
        add_full_access(&request.agent_id, &mut spec.args)?;
    }
    if let Some(effort) = request.reasoning_effort.as_deref() {
        add_reasoning_effort(&request.agent_id, effort, &mut spec.args)?;
    }
    configure_dimensions(spec, request.rows, request.cols)
}

pub fn isolate_account_environment(
    spec: &mut LaunchSpec,
    agent_id: &str,
    custom: bool,
    credential_names: Vec<String>,
) {
    if !custom && matches!(agent_id, "codex" | "claude" | "gemini") {
        spec.env_remove = credential_names;
    }
}

/// Points a terminal at one provider account.
///
/// `spec.env` is applied last of all — after the AppImage's own environment
/// repairs — so what lands here is what the CLI actually reads. The first
/// account names nothing, which is what makes it "wherever this CLI looks".
pub fn select_launch_account(spec: &mut LaunchSpec, agent_id: &str, account_id: Option<&str>) {
    let Some(account_id) = account_id else {
        return;
    };
    let Ok(home) = crate::provider_auth_registry::Registry::load().home(agent_id, account_id)
    else {
        return;
    };
    if let Some((name, value)) = home.env() {
        spec.env.push((name, value));
    }
}

pub fn configure_dimensions(
    spec: &mut LaunchSpec,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<(), CoreError> {
    spec.rows = dimension(rows, 2, 500, "rows")?.unwrap_or(spec.rows);
    spec.cols = dimension(cols, 2, 1_000, "columns")?.unwrap_or(spec.cols);
    Ok(())
}

pub fn validate_ssh_target(target: &str) -> Result<(), CoreError> {
    let valid = !target.is_empty()
        && target.len() <= 255
        && !target.starts_with('-')
        && target
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".@:_-[]%".contains(character));
    if valid {
        Ok(())
    } else {
        Err(invalid("invalid SSH target"))
    }
}

fn dimension(
    value: Option<u16>,
    min: u16,
    max: u16,
    label: &str,
) -> Result<Option<u16>, CoreError> {
    match value {
        Some(value) if !(min..=max).contains(&value) => {
            Err(invalid(&format!("invalid terminal {label}")))
        }
        value => Ok(value),
    }
}

pub(super) fn invalid(message: &str) -> CoreError {
    CoreError::Settings(message.into())
}
