use tauri::State;

use crate::state::AppState;

/// Memory is one markdown file per project (plus a global default).
fn memory_path(state: &State<'_, AppState>, project: Option<String>) -> std::path::PathBuf {
    let file = match project
        .map(|p| {
            p.chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                .take(48)
                .collect::<String>()
        })
        .filter(|p| !p.is_empty())
    {
        Some(key) => format!("memory-{key}.md"),
        None => "memory.md".to_string(),
    };
    state
        .settings_path
        .parent()
        .map(|p| p.join(&file))
        .unwrap_or_else(|| std::env::temp_dir().join(file))
}

#[tauri::command]
pub async fn load_memory(
    state: State<'_, AppState>,
    project: Option<String>,
) -> Result<String, String> {
    Ok(std::fs::read_to_string(memory_path(&state, project)).unwrap_or_default())
}

#[tauri::command]
pub async fn save_memory(
    state: State<'_, AppState>,
    project: Option<String>,
    content: String,
) -> Result<(), String> {
    let path = memory_path(&state, project);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}
