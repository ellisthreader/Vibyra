use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::{CoreError, CoreResult};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub previous_path: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Changes {
    pub root: String,
    pub files: Vec<ChangedFile>,
}

// No shell, pager, index writes, external diff program or textconv filters.
fn git(root: &Path, args: &[&str], limit: usize) -> CoreResult<String> {
    let mut child = Command::new("git")
        .arg("--no-pager")
        .arg("--literal-pathspecs")
        .args(["-c", "core.fsmonitor=false"])
        .arg("-C")
        .arg(root)
        .args(args)
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
    let project = Path::new(root).canonicalize()?;
    let repo = git(&project, &["rev-parse", "--show-toplevel"], 32_768)?;
    let root = repo.trim_end().to_string();
    let raw = git(
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
    Ok(Changes {
        root,
        files: parse_status(&raw),
    })
}

pub fn change_preview(root: &str, path: &str) -> CoreResult<String> {
    // Re-read the scoped inventory: caller cannot select another project's file.
    let list = changes(root)?;
    let file = list
        .files
        .iter()
        .find(|file| file.path == path)
        .ok_or_else(|| {
            CoreError::InvalidPath("This file is no longer changed. Refresh the list.".into())
        })?;
    let repo = Path::new(&list.root);
    if file.status == "??" {
        let full = repo.join(path).canonicalize()?;
        if !full.starts_with(Path::new(root).canonicalize()?) {
            return Err(CoreError::InvalidPath(
                "File points outside this project".into(),
            ));
        }
        let preview = super::read_file_preview(&full.to_string_lossy(), 256 * 1024)?;
        return Ok(format!(
            "New file: {path}\n\n{}{}",
            preview.content,
            if preview.truncated {
                "\n\n[Preview truncated]"
            } else {
                ""
            }
        ));
    }
    let mut args = vec![
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--cached",
        "--",
        path,
    ];
    if let Some(previous) = &file.previous_path {
        args.push(previous);
    }
    let staged = git(repo, &args, 512 * 1024)?;
    args.remove(4);
    let working = git(repo, &args, 512 * 1024)?;
    let mut result = Vec::new();
    if !staged.is_empty() {
        result.push(format!("Staged changes\n{staged}"));
    }
    if !working.is_empty() {
        result.push(format!("Working changes\n{working}"));
    }
    Ok(if result.is_empty() {
        "No text diff is available for this change.".into()
    } else {
        result.join("\n")
    })
}

#[cfg(test)]
#[path = "git_changes_tests.rs"]
mod tests;
