use std::path::PathBuf;

use vibyra_core::github::{self, GithubStatus, PrState, RepoBranches};
use vibyra_core::CoreError;

use super::run_blocking_core;

// GitHub through `gh`, from the Review tool. Auth lives entirely in the
// official CLI — these commands never see or store a token.

#[tauri::command]
pub async fn github_status(project_root: String) -> Result<GithubStatus, CoreError> {
    run_blocking_core(move || Ok(github::github_status(&PathBuf::from(project_root)))).await
}

#[tauri::command]
pub async fn github_create_pr(
    worktree: String,
    title: String,
    body: String,
    base: Option<String>,
) -> Result<String, CoreError> {
    run_blocking_core(move || {
        github::create_pr(&PathBuf::from(worktree), &title, &body, base.as_deref())
    })
    .await
}

/// The branches a pull request could target, for the base picker. Fetched
/// when the sheet opens and never again — the answer changes on the scale of
/// somebody creating a branch, not on the scale of a keystroke.
#[tauri::command]
pub async fn github_list_branches(worktree: String) -> Result<RepoBranches, CoreError> {
    run_blocking_core(move || github::list_branches(&PathBuf::from(worktree))).await
}

/// What became of a pull request. Called only when the user asks for it: a
/// poll would spend their API budget re-learning an answer nobody is reading.
#[tauri::command]
pub async fn github_pr_state(worktree: String, url: String) -> Result<PrState, CoreError> {
    run_blocking_core(move || github::pr_state(&PathBuf::from(worktree), &url)).await
}

/// Opens the pull request the user just created. Only a github.com link is
/// accepted — the URL came from `gh`'s stdout, and this guard keeps the
/// command useless for anything else.
#[tauri::command]
pub fn github_open_pr(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/") {
        return Err("Not a GitHub pull request link.".into());
    }
    crate::provider_auth_url::open(&url)
}
