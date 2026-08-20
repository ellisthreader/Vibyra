use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use serde::Serialize;

use crate::parallel::map_parallel;
use crate::{CoreError, CoreResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeWorkspacePreflight {
    pub changed_files: usize,
    pub fingerprint: String,
}

pub(crate) struct SafeWorkspaceState {
    pub project: PathBuf,
    pub repo: PathBuf,
    pub relative: PathBuf,
    pub preflight: SafeWorkspacePreflight,
}

pub(crate) fn git(repo: &Path, args: &[&str]) -> CoreResult<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()?;
    git_result(output, args.join(" "))
}

pub(crate) fn git_result(output: Output, action: String) -> CoreResult<String> {
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(CoreError::Settings(format!(
        "Safe mode could not {action}: {detail}"
    )))
}

fn command_bytes(repo: &Path, args: &[&str]) -> CoreResult<Vec<u8>> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()?;
    if output.status.success() {
        return Ok(output.stdout);
    }
    git_result(output, args.join(" ")).map(|_| Vec::new())
}

fn fingerprint(repo: &Path, status: &[u8]) -> CoreResult<String> {
    let mut hasher = DefaultHasher::new();
    command_bytes(repo, &["rev-parse", "HEAD"])?.hash(&mut hasher);
    status.hash(&mut hasher);
    command_bytes(repo, &["diff", "--binary", "HEAD", "--", "."])?.hash(&mut hasher);
    let untracked = command_bytes(repo, &["ls-files", "--others", "--exclude-standard", "-z"])?;
    let paths: Vec<&[u8]> = untracked
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .collect();

    // Safe mode blocks the terminal launch until this returns, and an
    // untracked tree can be thousands of files, so read and digest them in
    // parallel. `map_parallel` preserves order, which keeps the combined
    // fingerprint deterministic for a given working tree.
    let digests = map_parallel(&paths, |relative| {
        let path = repo.join(String::from_utf8_lossy(relative).as_ref());
        std::fs::read(path).ok().map(|content| {
            let mut file = DefaultHasher::new();
            content.hash(&mut file);
            file.finish()
        })
    });
    for (relative, digest) in paths.iter().zip(digests) {
        relative.hash(&mut hasher);
        digest.hash(&mut hasher);
    }
    Ok(format!("{:016x}", hasher.finish()))
}

pub(crate) fn safe_workspace_state(project_root: &Path) -> CoreResult<SafeWorkspaceState> {
    let project = project_root.canonicalize()?;
    let repo = PathBuf::from(git(&project, &["rev-parse", "--show-toplevel"])?).canonicalize()?;
    let relative = project
        .strip_prefix(&repo)
        .map_err(|_| CoreError::InvalidPath("project is outside its Git repository".to_string()))?
        .to_path_buf();
    let status = command_bytes(
        &repo,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    let changed_files = status
        .split(|byte| *byte == 0)
        .filter(|entry| !entry.is_empty())
        .count();
    let preflight = SafeWorkspacePreflight {
        changed_files,
        fingerprint: fingerprint(&repo, &status)?,
    };
    Ok(SafeWorkspaceState {
        project,
        repo,
        relative,
        preflight,
    })
}

pub fn safe_workspace_preflight(project_root: &Path) -> CoreResult<SafeWorkspacePreflight> {
    Ok(safe_workspace_state(project_root)?.preflight)
}
