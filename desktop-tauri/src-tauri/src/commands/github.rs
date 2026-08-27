use std::path::PathBuf;
use std::sync::Arc;

use tauri::State;

use vibyra_core::github::{self, GithubStatus};
use vibyra_core::CoreError;

use crate::github_integration::{GithubIntegrationManager, GithubIntegrationStatus};
use crate::state::AppState;

use super::{run_blocking, run_blocking_core};

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
    state: State<'_, AppState>,
) -> Result<String, CoreError> {
    let manager = Arc::clone(&state.github_integration);
    run_blocking_core(move || {
        ensure_permissions(manager.status())?;
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

#[tauri::command]
pub async fn github_integration_status(
    state: State<'_, AppState>,
) -> Result<GithubIntegrationStatus, String> {
    Ok(run_manager(
        Arc::clone(&state.github_integration),
        GithubIntegrationManager::status,
    )
    .await)
}

#[tauri::command]
pub async fn github_connect(state: State<'_, AppState>) -> Result<GithubIntegrationStatus, String> {
    Ok(run_manager(
        Arc::clone(&state.github_integration),
        GithubIntegrationManager::connect,
    )
    .await)
}

#[tauri::command]
pub async fn github_cancel_connect(
    state: State<'_, AppState>,
) -> Result<GithubIntegrationStatus, String> {
    Ok(run_manager(
        Arc::clone(&state.github_integration),
        GithubIntegrationManager::cancel,
    )
    .await)
}

#[tauri::command]
pub async fn github_disconnect(
    state: State<'_, AppState>,
) -> Result<GithubIntegrationStatus, String> {
    Ok(run_manager(
        Arc::clone(&state.github_integration),
        GithubIntegrationManager::disconnect,
    )
    .await)
}

#[tauri::command]
pub fn github_open_install() -> Result<(), String> {
    crate::provider_auth_url::open(GITHUB_CLI_INSTALL_URL)
}

const GITHUB_CLI_INSTALL_URL: &str = "https://cli.github.com/";

fn ensure_permissions(status: GithubIntegrationStatus) -> Result<(), CoreError> {
    if status.permissions_ready {
        Ok(())
    } else {
        Err(CoreError::Settings(
            "Connect GitHub in Settings > Integrations and approve repository permissions first."
                .into(),
        ))
    }
}

async fn run_manager(
    manager: Arc<GithubIntegrationManager>,
    action: fn(&GithubIntegrationManager) -> GithubIntegrationStatus,
) -> GithubIntegrationStatus {
    run_blocking(move || Ok(action(&manager)))
        .await
        .unwrap_or_else(|error| GithubIntegrationStatus {
            error: Some(error),
            ..GithubIntegrationStatus::default()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installer_destination_is_fixed_and_official() {
        assert_eq!(GITHUB_CLI_INSTALL_URL, "https://cli.github.com/");
    }

    #[test]
    fn pull_request_gate_requires_verified_permissions() {
        let denied = ensure_permissions(GithubIntegrationStatus {
            connected: true,
            permissions_ready: false,
            ..GithubIntegrationStatus::default()
        });
        assert!(denied.is_err());
        assert!(ensure_permissions(GithubIntegrationStatus {
            connected: true,
            permissions_ready: true,
            ..GithubIntegrationStatus::default()
        })
        .is_ok());
    }
}
