use tauri::State;
use vibyra_core::memory::{
    index_vault, load_connected_vault, read_vault_note, MemoryNoteIndex, MemoryNoteView,
};

use crate::state::AppState;

use super::memory::{project_key, source_store_path};
use super::run_blocking;

#[tauri::command]
pub async fn memory_note_index(
    state: State<'_, AppState>,
    project: Option<String>,
) -> Result<MemoryNoteIndex, String> {
    let store = source_store_path(&state);
    let project = project_key(project);
    run_blocking(move || {
        let vault = load_connected_vault(&store, &project)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "No Obsidian vault is connected".to_string())?;
        index_vault(&vault).map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn read_memory_note(
    state: State<'_, AppState>,
    project: Option<String>,
    path: String,
) -> Result<MemoryNoteView, String> {
    let store = source_store_path(&state);
    let project = project_key(project);
    run_blocking(move || {
        let vault = load_connected_vault(&store, &project)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "No Obsidian vault is connected".to_string())?;
        read_vault_note(&vault, &path).map_err(|error| error.to_string())
    })
    .await
}
