use crate::git::command_output;
use std::{path::Path, process::Command};
use vibyra_core::pty::LaunchSpec;

pub(crate) fn spec(kind: &str, root: &Path) -> Result<LaunchSpec, String> {
    let mut spec = LaunchSpec::shell(None, Some(root.to_string_lossy().into_owned()));
    spec.rows = 30;
    spec.cols = 100;
    // Native CLI login storage remains on the host. Inherited automation API
    // keys must not silently bill a different account than the CLI login.
    spec.env_remove = [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "OPENROUTER_API_KEY",
        "CODEX_API_KEY",
    ]
    .iter()
    .map(|key| (*key).into())
    .collect();
    match kind {
        "shell" => {}
        "codex" => {
            spec.program = "codex".into();
            spec.args = [
                "--sandbox",
                "workspace-write",
                "--ask-for-approval",
                "on-request",
                "--no-alt-screen",
            ]
            .iter()
            .map(|value| (*value).into())
            .collect();
        }
        "claude" => {
            let mut help = Command::new("claude");
            help.arg("--help");
            let (help, _) = command_output(help, 64 * 1024)?;
            // Claude renamed its normal interactive permission mode. Probe the
            // installed CLI and fail closed if neither documented mode exists.
            let mode = if help.contains("\"manual\"") {
                "manual"
            } else if help.contains("\"default\"") {
                "default"
            } else {
                return Err(
                    "installed Claude CLI does not advertise a normal permission mode".into(),
                );
            };
            spec.program = "claude".into();
            spec.args = vec!["--permission-mode".into(), mode.into()];
        }
        _ => return Err("choose shell, codex, or claude".into()),
    }
    Ok(spec)
}
