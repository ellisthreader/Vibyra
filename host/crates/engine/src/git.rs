use crate::{state::OUTPUT_LIMIT, Engine};
use serde_json::{json, Value};
use std::{
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::mpsc,
    time::Duration,
};

pub(crate) fn command_output(mut command: Command, limit: usize) -> Result<(String, bool), String> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("process output unavailable")?;
    let (tx, rx) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take((limit + 1) as u64).read_to_end(&mut bytes);
        let _ = tx.send(result.map(|_| bytes));
    });
    let bytes = match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(bytes)) => bytes,
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("computer command timed out or failed".into());
        }
    };
    let truncated = bytes.len() > limit;
    if truncated {
        let _ = child.kill();
    }
    let deadline = std::time::Instant::now() + Duration::from_secs(1);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if std::time::Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(10))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("computer command did not exit".into());
            }
        }
    };
    if !status.success() && !truncated {
        return Err("computer command failed; verify the project on your computer".into());
    }
    let mut output = String::from_utf8_lossy(&bytes[..bytes.len().min(limit)]).into_owned();
    while output.len() > limit {
        output.pop();
    }
    Ok((output, truncated))
}

fn git(root: &Path, args: &[&str]) -> Result<(String, bool), String> {
    if std::fs::canonicalize(root).map_err(|e| e.to_string())? != root {
        return Err("project root changed; approve it locally again".into());
    }
    let mut command = Command::new("git");
    for key in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_EXTERNAL_DIFF",
    ] {
        command.env_remove(key);
    }
    command
        .current_dir(root)
        .args([
            "--no-pager",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.quotePath=true",
        ])
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0");
    command_output(command, OUTPUT_LIMIT)
}

impl Engine {
    pub(crate) fn diff(&self, params: &Value) -> Result<Value, String> {
        let project = self.project(params)?;
        let (diff, truncated) = git(
            &project.path,
            &["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--"],
        )
        .or_else(|_| {
            git(
                &project.path,
                &["diff", "--no-ext-diff", "--no-textconv", "--"],
            )
        })?;
        Ok(json!({"diff":diff,"truncated":truncated}))
    }

    pub(crate) fn status(&self, params: &Value) -> Result<Value, String> {
        let project = self.project(params)?;
        let (branch, _) = git(&project.path, &["branch", "--show-current"])?;
        let (changes, truncated) = git(
            &project.path,
            &["status", "--porcelain=v1", "--untracked-files=normal"],
        )?;
        Ok(json!({"branch":branch.trim(),"changes":changes,"truncated":truncated}))
    }
}
