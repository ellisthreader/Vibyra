//! Plain Git plumbing for Agent worktree apply/discard: no hooks, no fsmonitor,
//! no inherited repository overrides, and no content filters (cat-file only).
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

pub(crate) fn run(root: &Path, args: &[&str], input: Option<&str>) -> Result<Vec<u8>, String> {
    let mut child = Command::new("git")
        .args(["--no-pager", "-c", "core.hooksPath=/dev/null"])
        .args(["-c", "core.fsmonitor=false", "-C"])
        .arg(root)
        .args(args)
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_COMMON_DIR")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Git is unavailable on this computer.".to_string())?;
    if let (Some(text), Some(mut stdin)) = (input, child.stdin.take()) {
        stdin
            .write_all(text.as_bytes())
            .map_err(|_| "Git stopped reading its input.".to_string())?;
    }
    let output = child
        .wait_with_output()
        .map_err(|_| "Git did not finish.".to_string())?;
    if !output.status.success() {
        return Err("Git refused this worktree operation.".into());
    }
    Ok(output.stdout)
}
