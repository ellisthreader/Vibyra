use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use vibyra_core::memory::{
    connect_vault, disconnect_vault, discover_vaults, load_connected_vault, read_imported_notes,
    search_vault, summarize_vault, MemoryImportBatch, MemorySnippet, VaultSummary,
};

use crate::state::AppState;

use super::run_blocking;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySourcesState {
    vault: Option<VaultSummary>,
    suggestions: Vec<VaultSummary>,
    warning: Option<String>,
}

pub(crate) fn project_key(project: Option<String>) -> String {
    project.unwrap_or_else(|| "global".into())
}

pub(crate) fn source_store_path(state: &State<'_, AppState>) -> PathBuf {
    state
        .settings_path
        .parent()
        .map(|path| path.join("memory-sources.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("vibyra-memory-sources.json"))
}

fn load_source_state(store: &Path, project: &str) -> MemorySourcesState {
    match load_connected_vault(store, project) {
        Ok(Some(path)) => match summarize_vault(&path) {
            Ok(vault) => MemorySourcesState {
                vault: Some(vault),
                suggestions: Vec::new(),
                warning: None,
            },
            Err(error) => disconnected_state(Some(error.to_string())),
        },
        Ok(None) => disconnected_state(None),
        Err(error) => disconnected_state(Some(error.to_string())),
    }
}

fn disconnected_state(warning: Option<String>) -> MemorySourcesState {
    MemorySourcesState {
        vault: None,
        suggestions: discover_vaults()
            .into_iter()
            .map(|candidate| candidate.summary)
            .collect(),
        warning,
    }
}

#[tauri::command]
pub async fn memory_sources(
    state: State<'_, AppState>,
    project: Option<String>,
) -> Result<MemorySourcesState, String> {
    let store = source_store_path(&state);
    let project = project_key(project);
    run_blocking(move || Ok(load_source_state(&store, &project))).await
}

#[tauri::command]
pub async fn connect_obsidian_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    project: Option<String>,
    candidate_id: Option<String>,
) -> Result<MemorySourcesState, String> {
    let store = source_store_path(&state);
    let project = project_key(project);
    let path = if let Some(candidate_id) = candidate_id {
        Some(
            run_blocking(move || {
                discover_vaults()
                    .into_iter()
                    .find(|candidate| candidate.summary.id == candidate_id)
                    .map(|candidate| candidate.path)
                    .ok_or_else(|| "That Obsidian vault is no longer available".into())
            })
            .await?,
        )
    } else {
        run_blocking(move || {
            let selected = app
                .dialog()
                .file()
                .set_title("Connect an Obsidian vault")
                .blocking_pick_folder();
            selected
                .map(|path| path.into_path().map_err(|error| error.to_string()))
                .transpose()
        })
        .await?
    };
    let Some(path) = path else {
        return run_blocking(move || Ok(load_source_state(&store, &project))).await;
    };
    run_blocking(move || {
        connect_vault(&store, &project, &path).map_err(|error| error.to_string())?;
        Ok(load_source_state(&store, &project))
    })
    .await
}

#[tauri::command]
pub async fn disconnect_obsidian_vault(
    state: State<'_, AppState>,
    project: Option<String>,
) -> Result<MemorySourcesState, String> {
    let store = source_store_path(&state);
    let project = project_key(project);
    run_blocking(move || {
        disconnect_vault(&store, &project).map_err(|error| error.to_string())?;
        Ok(load_source_state(&store, &project))
    })
    .await
}

#[tauri::command]
pub async fn pick_memory_files(app: AppHandle) -> Result<MemoryImportBatch, String> {
    run_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Import memory notes")
            .add_filter("Markdown notes", &["md", "markdown", "txt"])
            .blocking_pick_files()
            .unwrap_or_default();
        let paths: Result<Vec<_>, _> = selected.into_iter().map(|path| path.into_path()).collect();
        read_imported_notes(&paths.map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn search_memory_sources(
    state: State<'_, AppState>,
    project: Option<String>,
    query: String,
) -> Result<Vec<MemorySnippet>, String> {
    let store = source_store_path(&state);
    let project = project_key(project);
    run_blocking(move || {
        let Ok(Some(vault)) = load_connected_vault(&store, &project) else {
            return Ok(Vec::new());
        };
        search_vault(&vault, &query).map_err(|error| error.to_string())
    })
    .await
}
