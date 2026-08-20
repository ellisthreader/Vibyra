use std::path::Path;

use serde::Deserialize;
use vibyra_core::pty::LaunchSpec;
use vibyra_core::CoreError;

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

fn validate_model(model: &str) -> Result<(), CoreError> {
    let valid = !model.is_empty()
        && model.len() <= 200
        && !model.starts_with('-')
        && model
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_/ :".contains(character))
        && !model.contains(char::is_whitespace);
    if valid {
        Ok(())
    } else {
        Err(invalid("invalid model identifier"))
    }
}

fn add_full_access(agent: &str, args: &mut Vec<String>) -> Result<(), CoreError> {
    match agent {
        "claude" => args.push("--dangerously-skip-permissions".into()),
        "codex" => args.push("--dangerously-bypass-approvals-and-sandbox".into()),
        "gemini" => args.extend([
            "--approval-mode".into(),
            "yolo".into(),
            "--no-sandbox".into(),
        ]),
        _ => return Err(invalid("this agent does not support full access")),
    }
    Ok(())
}

fn add_reasoning_effort(
    agent: &str,
    effort: &str,
    args: &mut Vec<String>,
) -> Result<(), CoreError> {
    const EFFORTS: &[&str] = &[
        "none",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
        "ultra",
        "ultracode",
    ];
    if !EFFORTS.contains(&effort) {
        return Err(invalid("unsupported reasoning effort"));
    }
    match agent {
        "codex" => {
            let effort = if effort == "ultracode" {
                "xhigh"
            } else {
                effort
            };
            args.extend(["-c".into(), format!("model_reasoning_effort=\"{effort}\"")]);
        }
        "claude" => {
            let effort = if effort == "ultra" { "high" } else { effort };
            args.extend(["--effort".into(), effort.into()]);
        }
        _ => return Err(invalid("this agent does not support reasoning effort")),
    }
    Ok(())
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

fn invalid(message: &str) -> CoreError {
    CoreError::Settings(message.into())
}
