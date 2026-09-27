//! Reveal only the worktree named by a current, local Agent Computer grant.
use crate::agent_computer_access::{account_scope, looks_uuid};
use crate::agent_computer_store;
use crate::commands::run_blocking;
use crate::state::AppState;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::State;

#[tauri::command]
pub async fn agent_computer_reveal_worktree(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    if !looks_uuid(&id) {
        return Err("Unknown computer grant.".into());
    }
    let scope = account_scope(&state)?;
    let file = agent_computer_store::path(&state.settings_path)?;
    run_blocking(move || {
        let grant = agent_computer_store::active_worktree(&file, &scope, &id)?;
        if grant
            .path
            .canonicalize()
            .map_err(|_| "The Agent worktree is unavailable")?
            != grant.path
        {
            return Err("The Agent worktree changed on this computer.".into());
        }
        reveal(&grant.path)
    })
    .await
}

fn reveal(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg("-R").arg(path);
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(format!("/select,{}", path.display()));
        command
    };
    vibyra_core::launch_env::sanitize_command(&mut command);
    command
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(vibyra_core::process_group::reap_when_done)
        .map_err(|error| format!("Could not show the Agent worktree: {error}"))
}
