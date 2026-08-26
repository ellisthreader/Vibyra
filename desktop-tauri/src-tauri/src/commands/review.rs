use std::path::PathBuf;

use vibyra_core::review::{self, MergeOutcome, WorktreeStatus};
use vibyra_core::CoreError;

use super::run_blocking_core;

// The Review tool's native half. Every command takes the safe-workspace ref
// the pane has carried since launch (`SessionInfo.workspace`) rather than a
// session id, so a suspended pane — whose process is gone — reviews exactly
// like a live one. The `vibyra/*` branch guard inside `review` is what keeps
// these from acting on any other folder.

#[tauri::command]
pub async fn review_status(
    worktree: String,
    base_commit: String,
) -> Result<WorktreeStatus, CoreError> {
    run_blocking_core(move || review::worktree_status(&PathBuf::from(worktree), &base_commit)).await
}

#[tauri::command]
pub async fn review_file_diff(
    worktree: String,
    base_commit: String,
    path: String,
) -> Result<String, CoreError> {
    run_blocking_core(move || review::file_diff(&PathBuf::from(worktree), &base_commit, &path))
        .await
}

#[tauri::command]
pub async fn review_merge(
    project_root: String,
    worktree: String,
    base_commit: String,
) -> Result<MergeOutcome, CoreError> {
    run_blocking_core(move || {
        review::merge_back(
            &PathBuf::from(project_root),
            &PathBuf::from(worktree),
            &base_commit,
        )
    })
    .await
}

#[tauri::command]
pub async fn review_discard(project_root: String, worktree: String) -> Result<(), CoreError> {
    run_blocking_core(move || {
        review::discard_worktree(&PathBuf::from(project_root), &PathBuf::from(worktree))
    })
    .await
}
