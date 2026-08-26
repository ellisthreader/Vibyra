use std::path::PathBuf;

use vibyra_core::github::{self, GithubStatus};
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
