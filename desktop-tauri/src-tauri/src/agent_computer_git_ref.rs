//! Bounded, read-only Git reference lookup for an Agent worktree.
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub(super) fn value(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut child = Command::new("git")
        .arg("--no-pager")
        .arg("-C")
        .arg(root)
        .args(args)
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_COMMON_DIR")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "The worktree Git reference is unavailable.")?;
    let mut stream = child
        .stdout
        .take()
        .ok_or("Git returned no reference output")?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stream.by_ref().take(257).read_to_end(&mut bytes);
        let _ = std::io::copy(&mut stream, &mut std::io::sink());
        result.map(|_| bytes)
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("The worktree Git reference timed out.".into());
            }
        }
    };
    let bytes = reader
        .join()
        .map_err(|_| "Could not read the worktree Git reference")?
        .map_err(|_| "Could not read the worktree Git reference")?;
    if !status.success() || bytes.len() > 256 {
        return Err("The worktree Git reference is unavailable.".into());
    }
    String::from_utf8(bytes)
        .map(|s| s.trim().to_owned())
        .map_err(|_| "The worktree Git reference is unreadable.".into())
}
