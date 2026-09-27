use std::sync::Arc;

use tauri::State;
use vibyra_core::preview::{inspect_project, PreviewInspection, PreviewStatus};
use vibyra_core::CoreError;

use crate::state::AppState;

use super::run_blocking_core;

#[tauri::command]
pub async fn preview_inspect(root: String) -> Result<PreviewInspection, CoreError> {
    run_blocking_core(move || inspect_project(&root)).await
}

#[tauri::command]
pub async fn preview_start(
    state: State<'_, AppState>,
    root: String,
    target_id: String,
) -> Result<PreviewStatus, CoreError> {
    let preview = Arc::clone(&state.preview);
    run_blocking_core(move || preview.start(&root, &target_id)).await
}

#[tauri::command]
pub async fn preview_status(
    state: State<'_, AppState>,
    root: String,
    target_id: String,
) -> Result<PreviewStatus, CoreError> {
    let preview = Arc::clone(&state.preview);
    run_blocking_core(move || preview.status(&root, &target_id)).await
}

#[tauri::command]
pub async fn preview_stop(
    state: State<'_, AppState>,
    root: String,
    target_id: String,
) -> Result<PreviewStatus, CoreError> {
    let preview = Arc::clone(&state.preview);
    run_blocking_core(move || preview.stop(&root, &target_id)).await
}

#[tauri::command]
pub async fn preview_stop_project(
    state: State<'_, AppState>,
    root: String,
) -> Result<(), CoreError> {
    let preview = Arc::clone(&state.preview);
    run_blocking_core(move || preview.stop_project(&root)).await
}

/// Explicit browser handoff for an attached preview; never executes project code.
#[tauri::command]
pub fn preview_open_url(url: String) -> Result<(), String> {
    let parsed = preview_web_url(&url)?;
    crate::provider_auth_url::open(parsed.as_str())
        .map_err(|_| "Could not open the preview in your browser".into())
}

fn preview_web_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Enter a valid web URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || value.len() > 4096
        || value.chars().any(char::is_control)
    {
        return Err("Use an HTTP or HTTPS URL without embedded credentials".into());
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::preview_web_url;
    #[test]
    fn accepts_web_links_but_never_native_or_executable_schemes() {
        assert!(preview_web_url("http://localhost:8081/app").is_ok());
        assert!(preview_web_url("https://example.com").is_ok());
        for value in [
            "exp://localhost:8081",
            "javascript:alert(1)",
            "file:///tmp/a",
            "https://u:p@example.com",
        ] {
            assert!(preview_web_url(value).is_err());
        }
    }
}
