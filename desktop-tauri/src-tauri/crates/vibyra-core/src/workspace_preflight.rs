use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use serde::Serialize;

use crate::workspace_fingerprint::fingerprint;
use crate::{CoreError, CoreResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeWorkspacePreflight {
    /// False when the folder is not inside a Git work tree. Safe mode branches
    /// from Git, so a plain folder has nothing to branch from — a fact about
    /// the folder, not a failure to report.
    pub repository: bool,
    pub changed_files: usize,
    pub fingerprint: String,
}

pub(crate) const NOT_A_REPOSITORY: &str =
    "Safe mode needs a Git repository, and this folder is not one";

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

pub(crate) fn command_bytes(repo: &Path, args: &[&str]) -> CoreResult<Vec<u8>> {
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

/// Whether Safe mode has a repository to branch from. A plain folder answers
/// `false` rather than erroring: `git` calls it fatal, the launcher does not.
pub fn is_git_work_tree(project_root: &Path) -> bool {
    let Ok(project) = project_root.canonicalize() else {
        return false;
    };
    Command::new("git")
        .arg("-C")
        .arg(&project)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .is_ok_and(|output| {
            output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true"
        })
}

pub(crate) fn safe_workspace_state(project_root: &Path) -> CoreResult<SafeWorkspaceState> {
    let project = project_root.canonicalize()?;
    if !is_git_work_tree(&project) {
        return Err(CoreError::Settings(NOT_A_REPOSITORY.to_string()));
    }
    work_tree_state(project)
}

/// The state of a folder already known to be inside a Git work tree.
fn work_tree_state(project: PathBuf) -> CoreResult<SafeWorkspaceState> {
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
        repository: true,
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
    // Answer for a plain folder instead of failing: the launcher asks this to
    // decide whether Safe mode applies at all, and "no repository here" is an
    // answer it can act on.
    if !is_git_work_tree(project_root) {
        return Ok(SafeWorkspacePreflight {
            repository: false,
            changed_files: 0,
            fingerprint: String::new(),
        });
    }
    // Already known to be a work tree: asking Git a second time was a spawn.
    Ok(work_tree_state(project_root.canonicalize()?)?.preflight)
}
