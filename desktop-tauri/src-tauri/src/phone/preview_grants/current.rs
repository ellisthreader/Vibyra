use super::{attached, fingerprint};
use std::path::{Path, PathBuf};
use vibyra_core::preview::{inspect_project, PreviewTarget};

pub(super) fn current_identity(
    root: &Path,
    target_id: &str,
) -> Result<(PathBuf, String, Option<u16>), String> {
    if let Some(target) = crate::window_preview::Target::parse(target_id)? {
        let canonical = root.canonicalize().map_err(|e| e.to_string())?;
        if !canonical.is_dir() {
            return Err("Preview project folder is unavailable".into());
        }
        return Ok((canonical, target.info()?.fingerprint, None));
    }
    if let Some(port) = attached::port(target_id)? {
        let (canonical, fingerprint) = attached::identity(root, port)?;
        return Ok((canonical, fingerprint, Some(port)));
    }
    let (canonical, target) = current_target(root, target_id)?;
    if !target.runnable {
        return Err("This preview target cannot run".into());
    }
    Ok((
        canonical.clone(),
        fingerprint::capture(&canonical, &target)?,
        None,
    ))
}

fn current_target(root: &Path, target_id: &str) -> Result<(PathBuf, PreviewTarget), String> {
    let inspection =
        inspect_project(root.to_str().ok_or("Invalid preview path")?).map_err(|e| e.to_string())?;
    let target = inspection
        .targets
        .into_iter()
        .find(|item| item.id == target_id)
        .ok_or_else(|| {
            format!(
                "Preview target changed on the {}",
                crate::window_preview::host_noun()
            )
        })?;
    Ok((PathBuf::from(inspection.project_root), target))
}
