//! Resolve approved command paths without allowing project escapes.
use std::fs;
use std::path::{Path, PathBuf};

use super::refuse;
use crate::CoreResult;

/// Resolves `path` from `base`, refusing anything that leaves the project,
/// including through a symlink.
pub(super) fn inside(project: &Path, base: &Path, path: &str) -> CoreResult<PathBuf> {
    let joined = if path.is_empty() || path == "." {
        base.to_owned()
    } else {
        base.join(path)
    };
    let resolved = fs::canonicalize(&joined).map_err(|_| {
        refuse(&format!(
            "{} does not exist in the project.",
            joined.display()
        ))
    })?;
    if resolved.starts_with(project) {
        Ok(resolved)
    } else {
        Err(refuse("Paths must stay inside the project."))
    }
}
