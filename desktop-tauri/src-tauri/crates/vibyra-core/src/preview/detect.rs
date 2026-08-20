use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::{CoreError, CoreResult};

use super::builtin::{detect_laravel, detect_static_or_php};
use super::package::detect_package;
use super::target::{relative_label, unsupported_target};
use super::types::{DetectedTarget, PreviewInspection};

const APP_ROOTS: [&str; 16] = [
    ".",
    "frontend",
    "client",
    "web",
    "website",
    "site",
    "ui",
    "dashboard",
    "app",
    "mobile",
    "apps/web",
    "apps/client",
    "apps/mobile",
    "packages/web",
    "packages/app",
    "packages/mobile",
];
pub fn inspect_project(root: &str) -> CoreResult<PreviewInspection> {
    let root = canonical_project_root(root)?;
    let targets = detect_project(&root)?
        .into_iter()
        .map(|item| item.target)
        .collect();
    Ok(PreviewInspection {
        project_root: root.to_string_lossy().into_owned(),
        targets,
    })
}

pub(crate) fn detect_target(root: &str, id: &str) -> CoreResult<DetectedTarget> {
    let root = canonical_project_root(root)?;
    detect_project(&root)?
        .into_iter()
        .find(|item| item.target.id == id)
        .ok_or_else(|| {
            CoreError::Preview("preview target changed; inspect the project again".into())
        })
}

fn canonical_project_root(root: &str) -> CoreResult<PathBuf> {
    let path = fs::canonicalize(root)?;
    if !path.is_dir() {
        return Err(CoreError::InvalidPath(format!(
            "{} is not a folder",
            path.display()
        )));
    }
    Ok(path)
}

fn detect_project(root: &Path) -> CoreResult<Vec<DetectedTarget>> {
    let mut targets = Vec::new();
    let mut visited = HashSet::new();
    for relative in APP_ROOTS {
        let candidate = if relative == "." {
            root.to_owned()
        } else {
            root.join(relative)
        };
        let Ok(candidate) = fs::canonicalize(candidate) else {
            continue;
        };
        if !candidate.is_dir() || !candidate.starts_with(root) || !visited.insert(candidate.clone())
        {
            continue;
        }
        if let Some(target) = detect_app_root(root, &candidate)? {
            targets.push(target);
        }
        if targets.len() >= 12 {
            break;
        }
    }
    if targets.is_empty() {
        targets.push(unsupported_target(
            ".",
            "No browser preview",
            "No web entry or supported development command was found.",
        ));
    }
    Ok(targets)
}

fn detect_app_root(project: &Path, app: &Path) -> CoreResult<Option<DetectedTarget>> {
    let relative = relative_label(project, app);
    if let Some(target) = detect_laravel(app, &relative)? {
        return Ok(Some(target));
    }
    if let Some(target) = detect_package(app, &relative)? {
        return Ok(Some(target));
    }
    Ok(detect_static_or_php(app, &relative))
}
