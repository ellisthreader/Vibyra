use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use crate::{CoreError, CoreResult};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub previous_path: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Changes {
    pub root: String,
    pub files: Vec<ChangedFile>,
}

/// The list the Files panel was just shown, so opening one of its files does
/// not re-run a full `git status` it already paid for moments ago.
static RECENT: LazyLock<super::git_memo::Recent<String, Changes>> =
    LazyLock::new(|| super::git_memo::Recent::new(Duration::from_secs(3)));

// Desktop Git views keep normal filter semantics; Agent Computer uses safe_git.
pub(super) fn git(root: &Path, args: &[&str], limit: usize) -> CoreResult<String> {
    git_with_policy(root, args, limit, false)
}

fn safe_git(root: &Path, args: &[&str], limit: usize) -> CoreResult<String> {
    git_with_policy(root, args, limit, true)
}

fn git_with_policy(root: &Path, args: &[&str], limit: usize, safe: bool) -> CoreResult<String> {
    let overrides = if safe {
        super::git_command_policy::filter_overrides(root)?
    } else {
        Vec::new()
    };
    let mut command = Command::new("git");
    command.arg("--no-pager").arg("--literal-pathspecs").args([
        "-c",
        "core.fsmonitor=false",
        "-c",
        "diff.external=",
    ]);
    for value in &overrides {
        command.arg("-c").arg(value);
    }
    let mut child = command
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
        .spawn()?;
    let stdout = child.stdout.take().unwrap();
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut stream = stdout;
        let result = stream
            .by_ref()
            .take(limit as u64 + 1)
            .read_to_end(&mut bytes);
        let _ = std::io::copy(&mut stream, &mut std::io::sink());
        result.map(|_| bytes)
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(15)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(CoreError::Task(
                    "Reading file changes timed out. Try again.".into(),
                ));
            }
        }
    };
    let bytes = reader
        .join()
        .map_err(|_| CoreError::Task("Could not read Git output".into()))??;
    if !status.success() {
        return Err(CoreError::Task(
            "File changes are unavailable. Check that this folder is a Git repository.".into(),
        ));
    }
    if bytes.len() > limit {
        return Err(CoreError::Task(
            "This change is too large to display. Open the file in your editor.".into(),
        ));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn parse_status(raw: &str) -> Vec<ChangedFile> {
    let mut fields = raw.split('\0').filter(|s| !s.is_empty());
    let mut files = Vec::new();
    while let Some(field) = fields.next() {
        if field.len() < 4 || !field.is_char_boundary(3) {
            continue;
        }
        let status = field[..2].to_string();
        let previous_path = if status.contains(['R', 'C']) {
            fields.next().map(str::to_owned)
        } else {
            None
        };
        files.push(ChangedFile {
            path: field[3..].to_string(),
            status,
            previous_path,
        });
    }
    files
}

pub fn changes(root: &str) -> CoreResult<Changes> {
    changes_with_policy(root, false)
}

pub fn safe_changes(root: &str) -> CoreResult<Changes> {
    changes_with_policy(root, true)
}

fn changes_with_policy(root: &str, safe: bool) -> CoreResult<Changes> {
    let project = Path::new(root).canonicalize()?;
    let requested = root.to_string();
    let root = super::git_memo::toplevel(&project)?;
    let run = if safe { safe_git } else { git };
    let raw = run(
        &project,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--",
            ".",
        ],
        8 * 1024 * 1024,
    )?;
    let list = Changes {
        root,
        files: parse_status(&raw),
    };
    if !safe {
        RECENT.put(requested, list.clone());
    }
    Ok(list)
}

#[path = "git_change_preview.rs"]
mod preview;
pub use preview::{change_preview, safe_change_preview};

#[cfg(test)]
#[path = "git_changes_tests.rs"]
mod tests;
