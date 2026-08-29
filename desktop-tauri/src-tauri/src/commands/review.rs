use std::path::PathBuf;

use vibyra_core::review::{self, MergeOutcome, PruneOutcome, WorktreeEntry, WorktreeStatus};
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

/// `paths` selects which of the worktree's files to land, repo-root-relative.
/// Optional rather than required, and absent means all of them, so a caller
/// with no selection to make keeps calling this exactly as it always has.
#[tauri::command]
pub async fn review_merge(
    project_root: String,
    worktree: String,
    base_commit: String,
    paths: Option<Vec<String>>,
) -> Result<MergeOutcome, CoreError> {
    run_blocking_core(move || {
        review::merge_back(
            &PathBuf::from(project_root),
            &PathBuf::from(worktree),
            &base_commit,
            &paths.unwrap_or_default(),
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

/// Housekeeping. Both are guarded to `vibyra/*` inside the core, so neither
/// can see or touch a worktree or branch the app did not create.
#[tauri::command]
pub async fn review_list_worktrees(project_root: String) -> Result<Vec<WorktreeEntry>, CoreError> {
    run_blocking_core(move || review::list_worktrees(&PathBuf::from(project_root))).await
}

#[tauri::command]
pub async fn review_prune_worktrees(project_root: String) -> Result<PruneOutcome, CoreError> {
    run_blocking_core(move || review::prune_worktrees(&PathBuf::from(project_root))).await
}
