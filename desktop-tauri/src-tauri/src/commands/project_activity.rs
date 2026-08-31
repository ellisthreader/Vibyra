use std::path::PathBuf;

use vibyra_core::project_activity::{self, ProjectActivity};
use vibyra_core::CoreError;

use super::run_blocking_core;

/// Reads bounded Git aggregates only when the user opens Project activity.
/// Process and disk work stay off the Tauri runtime/UI thread.
#[tauri::command]
pub async fn project_activity(project_root: String) -> Result<ProjectActivity, CoreError> {
    run_blocking_core(move || project_activity::project_activity(&PathBuf::from(project_root)))
        .await
}
