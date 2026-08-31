//! The connected Obsidian vault, and the notes it can lend an agent.
//!
//! One vault for the whole app. It is connected from Settings → Integrations,
//! beside the provider accounts, because connecting it is a one-time setup act
//! rather than something done while working. Nothing here ever writes to the
//! vault: it is read-only, bounded, and local.

use std::path::Path;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use vibyra_core::memory::{
    connect_vault, disconnect_vault, discover_vaults, load_connected_vault, search_vault,
    summarize_vault, MemorySnippet, VaultSummary,
};

use crate::state::AppState;

use super::run_blocking;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySourcesState {
    vault: Option<VaultSummary>,
    suggestions: Vec<VaultSummary>,
    warning: Option<String>,
}

fn source_store_path(state: &State<'_, AppState>) -> std::path::PathBuf {
    state
        .settings_path
        .parent()
        .map(|path| path.join("memory-sources.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("vibyra-memory-sources.json"))
}

fn load_source_state(store: &Path) -> MemorySourcesState {
    match load_connected_vault(store) {
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
pub async fn memory_sources(state: State<'_, AppState>) -> Result<MemorySourcesState, String> {
    let store = source_store_path(&state);
    run_blocking(move || Ok(load_source_state(&store))).await
}

#[tauri::command]
pub async fn connect_obsidian_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    candidate_id: Option<String>,
) -> Result<MemorySourcesState, String> {
    let store = source_store_path(&state);
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
    // A cancelled picker is not a failure; report the state unchanged.
    let Some(path) = path else {
        return run_blocking(move || Ok(load_source_state(&store))).await;
    };
    run_blocking(move || {
        connect_vault(&store, &path).map_err(|error| error.to_string())?;
        Ok(load_source_state(&store))
    })
    .await
}

#[tauri::command]
pub async fn disconnect_obsidian_vault(
    state: State<'_, AppState>,
) -> Result<MemorySourcesState, String> {
    let store = source_store_path(&state);
    run_blocking(move || {
        disconnect_vault(&store).map_err(|error| error.to_string())?;
        Ok(load_source_state(&store))
    })
    .await
}

/// The notes worth lending for one question. Ranked locally, never uploaded.
#[tauri::command]
pub async fn search_memory_sources(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<MemorySnippet>, String> {
    let store = source_store_path(&state);
    run_blocking(move || {
        let Some(vault) = load_connected_vault(&store).unwrap_or(None) else {
            return Ok(Vec::new());
        };
        Ok(search_vault(&vault, &query).unwrap_or_default())
    })
    .await
}
