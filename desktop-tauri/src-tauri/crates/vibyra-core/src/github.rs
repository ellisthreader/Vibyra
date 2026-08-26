use std::ffi::OsStr;
use std::path::Path;
use std::process::Command;

use serde::Serialize;

use crate::{CoreError, CoreResult};

// GitHub through the official `gh` CLI, the same boundary the provider
// accounts keep: authorization stays with the official tool, and no token
// ever passes through Vibyra. Everything here shells out; nothing is stored.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubStatus {
    pub gh_installed: bool,
    pub authed: bool,
    /// The `origin` remote's URL, when the repo has one to push to.
    pub origin: Option<String>,
}

/// Whether a pull request could be opened from this project — three probes,
/// each folding to "no" rather than erroring, because an absent `gh` is a
/// state to render, not a failure.
pub fn github_status(project_root: &Path) -> GithubStatus {
    github_status_with_path(project_root, None)
}

pub(crate) fn github_status_with_path(project_root: &Path, path: Option<&OsStr>) -> GithubStatus {
    let gh_installed = run(gh(path).arg("--version")).is_ok();
    let authed = gh_installed && run(gh(path).args(["auth", "status"])).is_ok();
    let origin = run(Command::new("git")
        .arg("-C")
        .arg(project_root)
        .args(["remote", "get-url", "origin"]))
    .ok()
    .filter(|url| !url.is_empty());
    GithubStatus {
        gh_installed,
        authed,
        origin,
    }
}

/// Commits the worktree's pending work onto its branch, pushes the branch to
/// `origin`, and opens a pull request — returning the URL from `gh`'s own
/// output. The commit step is what makes the PR real: agents rarely commit,
/// so without it the branch tip is still the launch snapshot and the PR
/// would carry none of the work being reviewed.
pub fn create_pr(
    worktree: &Path,
    title: &str,
    body: &str,
    base: Option<&str>,
) -> CoreResult<String> {
    create_pr_with_path(worktree, title, body, base, None)
}

pub(crate) fn create_pr_with_path(
    worktree: &Path,
    title: &str,
    body: &str,
    base: Option<&str>,
    path: Option<&OsStr>,
) -> CoreResult<String> {
    // The branch comes from the worktree's own HEAD, through the same
    // ownership guard the review actions use — never from the caller.
    let branch = crate::review::vibyra_branch(worktree)?;
    commit_pending(worktree, title)?;
    run(Command::new("git")
        .arg("-C")
        .arg(worktree)
        .args(["push", "-u", "origin", &branch]))
    .map_err(|detail| CoreError::Settings(format!("Could not push {branch}: {detail}")))?;

    let mut command = gh(path);
    command.current_dir(worktree).args([
        "pr", "create", "--head", &branch, "--title", title, "--body", body,
    ]);
    if let Some(base) = base {
        command.args(["--base", base]);
    }
    let output = run(&mut command).map_err(|detail| {
        CoreError::Settings(format!("gh could not open the pull request: {detail}"))
    })?;
    pr_url_from(&output).ok_or_else(|| {
        CoreError::Settings("gh opened the pull request but printed no link".to_string())
    })
}

/// Stages and commits whatever the agent left uncommitted, titled like the
/// PR. A worktree whose work is already committed passes through untouched.
fn commit_pending(worktree: &Path, title: &str) -> CoreResult<()> {
    run(Command::new("git")
        .arg("-C")
        .arg(worktree)
        .args(["add", "-A", "--", "."]))
    .map_err(|detail| CoreError::Settings(format!("Could not stage the changes: {detail}")))?;
    let staged = Command::new("git")
        .arg("-C")
        .arg(worktree)
        .args(["diff", "--cached", "--quiet"])
        .status()?;
    if staged.success() {
        return Ok(());
    }
    run(Command::new("git")
        .arg("-C")
        .arg(worktree)
        .envs([
            ("GIT_AUTHOR_NAME", "Vibyra"),
            ("GIT_AUTHOR_EMAIL", "desktop@vibyra.local"),
            ("GIT_COMMITTER_NAME", "Vibyra"),
            ("GIT_COMMITTER_EMAIL", "desktop@vibyra.local"),
        ])
        .args(["commit", "-m", title]))
    .map_err(|detail| CoreError::Settings(format!("Could not commit the changes: {detail}")))?;
    Ok(())
}

/// `gh pr create` prints the new PR's URL as its final line.
pub(crate) fn pr_url_from(output: &str) -> Option<String> {
    output
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.starts_with("https://github.com/"))
        .map(str::to_string)
}

fn gh(path: Option<&OsStr>) -> Command {
    let mut command = Command::new("gh");
    if let Some(path) = path {
        command.env("PATH", path);
    }
    command
}

fn run(command: &mut Command) -> Result<String, String> {
    match command.output() {
        Ok(output) if output.status.success() => {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        Ok(output) => Err(String::from_utf8_lossy(&output.stderr).trim().to_string()),
        Err(error) => Err(error.to_string()),
    }
}

// The harness fakes `gh` with a shell script, which only Unix can exec.
#[cfg(all(test, unix))]
#[path = "github_tests.rs"]
mod tests;
