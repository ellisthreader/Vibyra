//! Desktop-only approval for sending one Preview target to one paired phone.
use crate::state::AppState;
use std::path::{Path, PathBuf};
use tauri::State;
use vibyra_core::fsx::worktrees;

use super::run_blocking;

#[tauri::command]
pub fn preview_share_available(state: State<'_, AppState>) -> bool {
    state.preview_grants.is_ok()
        && std::env::var("VIBYRA_PREVIEW_HTTP_PROOF").is_ok_and(|value| value == "1")
}

fn current_scope(project: &Path, requested: &Path) -> Result<PathBuf, String> {
    let project = project.canonicalize().map_err(|e| e.to_string())?;
    let requested = requested.canonicalize().map_err(|e| e.to_string())?;
    if requested == project {
        return Ok(requested);
    }
    let inventory = worktrees::inventory(project.to_str().ok_or("Project path cannot be shared")?)
        .map_err(|_| "This folder is not a worktree of the selected project".to_string())?;
    let allowed = inventory.worktrees.iter().any(|tree| {
        tree.available
            && Path::new(&tree.directory)
                .canonicalize()
                .is_ok_and(|path| path == requested)
    });
    if allowed {
        Ok(requested)
    } else {
        Err("This folder is not a worktree of the selected project".into())
    }
}

fn paired_project(state: &AppState, device_id: &str, project_id: &str) -> Result<PathBuf, String> {
    let phone = state.phone.lock();
    let paired = phone.status()["devices"]
        .as_array()
        .is_some_and(|devices| devices.iter().any(|device| device["id"] == device_id));
    if !paired {
        return Err("Pair this phone with the Mac first".into());
    }
    phone
        .project_root(project_id)
        .ok_or_else(|| "This project is no longer open on the Mac".into())
}

#[tauri::command]
pub async fn preview_share_status(
    state: State<'_, AppState>,
    device_id: String,
    project_id: String,
    root: String,
    target_id: String,
    start_path: Option<String>,
) -> Result<bool, String> {
    let project = paired_project(&state, &device_id, &project_id)?;
    let grants = state.preview_grants.as_ref().map_err(Clone::clone)?.clone();
    run_blocking(move || {
        current_scope(&project, Path::new(&root))?;
        Ok(grants
            .authorize(&device_id, &project_id, Path::new(&root), &target_id)
            .is_ok_and(|approved| approved.start_path == start_path.as_deref().unwrap_or("/")))
    })
    .await
}

#[tauri::command]
pub async fn preview_share_set(
    state: State<'_, AppState>,
    device_id: String,
    project_id: String,
    root: String,
    target_id: String,
    start_path: Option<String>,
    enabled: bool,
) -> Result<(), String> {
    let project = paired_project(&state, &device_id, &project_id)?;
    let grants = state.preview_grants.as_ref().map_err(Clone::clone)?.clone();
    run_blocking(move || {
        if enabled {
            current_scope(&project, Path::new(&root))?;
            grants.grant_at(
                &device_id,
                &project_id,
                Path::new(&root),
                &target_id,
                start_path.as_deref().unwrap_or("/"),
            )
        } else {
            grants.revoke(&device_id, &project_id, Path::new(&root), &target_id)
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::current_scope;
    use std::fs;
    use std::process::Command;

    #[test]
    fn scope_is_exact_project_or_registered_git_worktree() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("project");
        let stranger = temp.path().join("stranger");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&stranger).unwrap();
        assert!(current_scope(&project, &project).is_ok());
        assert!(current_scope(&project, &stranger).is_err());
        let git = |args: &[&str]| {
            assert!(Command::new("git")
                .arg("-C")
                .arg(&project)
                .args(args)
                .status()
                .unwrap()
                .success());
        };
        git(&["init", "-q"]);
        git(&[
            "-c",
            "user.name=Preview",
            "-c",
            "user.email=preview@example.invalid",
            "commit",
            "--allow-empty",
            "-qm",
            "initial",
        ]);
        let branch = temp.path().join("branch");
        git(&[
            "worktree",
            "add",
            "-qb",
            "preview-branch",
            branch.to_str().unwrap(),
        ]);
        assert_eq!(
            current_scope(&project, &branch).unwrap(),
            branch.canonicalize().unwrap()
        );
        assert!(current_scope(&project, &stranger).is_err());
    }
}
