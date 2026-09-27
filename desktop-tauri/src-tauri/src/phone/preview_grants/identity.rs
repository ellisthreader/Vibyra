use super::Grant;
use std::path::{Path, PathBuf};
use vibyra_core::fsx::worktrees;

pub(super) fn same_slot(left: &Grant, right: &Grant) -> bool {
    left.device_id == right.device_id
        && left.account_id == right.account_id
        && left.project_id == right.project_id
        && left.source_root == right.source_root
        && left.target_id == right.target_id
}

pub(super) fn validate_id(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err("Invalid preview device or project ID".into());
    }
    Ok(())
}

pub(super) fn absolute_root(root: &Path) -> Result<PathBuf, String> {
    let absolute = if root.is_absolute() {
        root.to_owned()
    } else {
        std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join(root)
    };
    Ok(absolute.components().collect())
}

pub(super) fn current_scope(project: &Path, requested: &Path) -> Result<(), String> {
    let project = project.canonicalize().map_err(|e| e.to_string())?;
    let requested = requested.canonicalize().map_err(|e| e.to_string())?;
    if requested == project {
        return Ok(());
    }
    let inventory = worktrees::inventory(project.to_str().ok_or("Invalid project path")?)
        .map_err(|_| "This folder is not a current project worktree".to_string())?;
    if inventory.worktrees.iter().any(|tree| {
        tree.available
            && Path::new(&tree.directory)
                .canonicalize()
                .is_ok_and(|path| path == requested)
    }) {
        Ok(())
    } else {
        Err("This folder is not a current project worktree".into())
    }
}
