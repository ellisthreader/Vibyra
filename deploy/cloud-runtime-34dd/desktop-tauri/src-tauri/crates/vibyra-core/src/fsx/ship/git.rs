//! The one way the ship steps run Git when they need its bytes back.
//!
//! Commit and push go through `scaffold::run_step_with` (process-group cancel,
//! stall guard); the quick plumbing here — status, refs, trees — shares its
//! rules: argv only, no shell, inherited `GIT_*` dropped, hooks and fsmonitor
//! off, repository filter programs overridden, prompts refused, and every run
//! bounded in time and output.
use super::ShipError;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(windows)]
pub(super) const NO_HOOKS: &str = "core.hooksPath=NUL";
#[cfg(not(windows))]
pub(super) const NO_HOOKS: &str = "core.hooksPath=/dev/null";

const LIMIT: usize = 16 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(60);
const INHERITED: [&str; 11] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_PREFIX",
    "GIT_EXTERNAL_DIFF",
];

/// The environment every ship Git call starts from.
pub(super) fn sanitize(command: &mut Command) {
    crate::launch_env::sanitize_command(command);
    for key in INHERITED {
        command.env_remove(key);
    }
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_MESSAGES", "C")
        .env("LANGUAGE", "C");
}

/// Options that precede the subcommand on every call.
pub(super) fn base_args() -> Vec<String> {
    [
        "--no-pager",
        "--literal-pathspecs",
        "-c",
        "core.fsmonitor=false",
        "-c",
    ]
    .iter()
    .map(|s| s.to_string())
    .chain([NO_HOOKS.to_string()])
    .chain(["-c", "diff.external=", "-c", "core.quotepath=off"].map(String::from))
    .collect()
}

pub(crate) fn git(dir: &Path, args: &[&str]) -> Result<Vec<u8>, ShipError> {
    git_with(dir, args, &[], None)
}

pub(crate) fn text(dir: &Path, args: &[&str]) -> Result<String, ShipError> {
    Ok(String::from_utf8_lossy(&git(dir, args)?)
        .trim_end()
        .to_string())
}

/// `env` is for the few callers that point Git at a private index or author.
pub(super) fn git_with(
    dir: &Path,
    args: &[&str],
    env: &[(&str, &str)],
    stdin: Option<&[u8]>,
) -> Result<Vec<u8>, ShipError> {
    let filters = crate::fsx::git_command_policy::filter_overrides(dir)
        .map_err(|_| ShipError::new("Git filter settings could not be checked."))?;
    let mut command = Command::new(crate::launch_env::resolve_program("git"));
    command.args(base_args());
    for filter in &filters {
        command.arg("-c").arg(filter);
    }
    command.arg("-C").arg(dir).args(args);
    sanitize(&mut command);
    command.envs(env.iter().copied());
    command
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|_| ShipError::new("Git could not be started on this computer."))?;
    if let (Some(bytes), Some(mut pipe)) = (stdin, child.stdin.take()) {
        let bytes = bytes.to_vec();
        std::thread::spawn(move || {
            let _ = pipe.write_all(&bytes);
        });
    }
    let out = drain(child.stdout.take().unwrap(), LIMIT);
    let err = drain(child.stderr.take().unwrap(), 64 * 1024);
    let deadline = Instant::now() + TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(ShipError::new("Git took too long. Try again."));
            }
        }
    };
    let stdout = out.join().unwrap_or_default();
    let stderr = err.join().unwrap_or_default();
    if stdout.len() > LIMIT {
        return Err(ShipError::new("That is too large to handle here."));
    }
    if !status.success() {
        return Err(ShipError::from_git(&String::from_utf8_lossy(&stderr)));
    }
    Ok(stdout)
}

fn drain(source: impl Read + Send + 'static, limit: usize) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut source = source;
        let _ = (&mut source).take(limit as u64 + 1).read_to_end(&mut bytes);
        let _ = std::io::copy(&mut source, &mut std::io::sink());
        bytes
    })
}
