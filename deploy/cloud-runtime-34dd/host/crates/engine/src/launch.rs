use crate::git::command_output;
use std::{path::Path, process::Command};
use vibyra_core::pty::LaunchSpec;

/// How an agent CLI is started in a session. `Fresh` may pin the id a Claude
/// session will use, so a restart can find it again; `Resume` reopens one.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Start<'a> {
    Fresh { session_id: Option<&'a str> },
    Resume { session_id: &'a str },
}

/// Claude renamed its normal interactive permission mode. Probe the installed
/// CLI's help text and fail closed if neither documented mode exists.
pub(crate) fn permission_mode(help: &str) -> Result<&'static str, String> {
    if help.contains("\"manual\"") {
        Ok("manual")
    } else if help.contains("\"default\"") {
        Ok("default")
    } else {
        Err("installed Claude CLI does not advertise a normal permission mode".into())
    }
}

/// The arguments for `kind`. `codex resume` is a subcommand whose options are
/// parsed after it, so the verb goes first; Claude takes flags anywhere.
pub(crate) fn args(kind: &str, claude_mode: &str, start: Start) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    match (kind, start) {
        ("codex", start) => {
            if let Start::Resume { session_id } = start {
                args.extend(["resume".into(), session_id.into()]);
            }
            args.extend(
                [
                    "--sandbox",
                    "workspace-write",
                    "--ask-for-approval",
                    "on-request",
                    "--no-alt-screen",
                ]
                .map(String::from),
            );
        }
        ("claude", Start::Resume { session_id }) => {
            args.extend(["--resume".into(), session_id.into()]);
            args.extend(["--permission-mode".into(), claude_mode.into()]);
        }
        ("claude", Start::Fresh { session_id }) => {
            args.extend(["--permission-mode".into(), claude_mode.into()]);
            if let Some(id) = session_id {
                args.extend(["--session-id".into(), id.into()]);
            }
        }
        _ => {}
    }
    args
}

pub(crate) fn spec(kind: &str, root: &Path, start: Start) -> Result<LaunchSpec, String> {
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
            spec.args = args(kind, "", start);
        }
        "claude" => {
            let mut help = Command::new("claude");
            help.arg("--help");
            let (help, _) = command_output(help, 64 * 1024)?;
            spec.program = "claude".into();
            spec.args = args(kind, permission_mode(&help)?, start);
        }
        _ => return Err("choose shell, codex, or claude".into()),
    }
    Ok(spec)
}
