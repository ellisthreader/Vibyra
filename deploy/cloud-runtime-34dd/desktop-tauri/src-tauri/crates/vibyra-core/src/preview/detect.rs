use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::{CoreError, CoreResult};

use super::builtin::{detect_laravel, detect_static_or_php};
use super::desktop_command::custom_target;
use super::desktop_detect::detect_desktop;
use super::package::detect_package;
use super::stacks::detect_stack;
use super::target::{relative_label, unsupported_target};
use super::types::{
    DesktopCommand, DetectedTarget, LaunchRecipe, PreviewInspection, PreviewTarget, TargetInfo,
};
use super::workspace::{discover, APP_ROOTS};

pub fn inspect_project(root: &str) -> CoreResult<PreviewInspection> {
    inspect_project_with(root, &[])
}

/// Detected targets plus the desktop commands an owner approved for this
/// project that detection does not offer itself.
pub fn inspect_project_with(
    root: &str,
    custom: &[DesktopCommand],
) -> CoreResult<PreviewInspection> {
    let root = canonical_project_root(root)?;
    let detected = detect_with(&root, custom)?;
    let info = detected
        .iter()
        .filter(|item| item.info != TargetInfo::default())
        .map(|item| (item.target.id.clone(), item.info.clone()))
        .collect();
    Ok(PreviewInspection {
        project_root: root.to_string_lossy().into_owned(),
        targets: detected.into_iter().map(|item| item.target).collect(),
        info,
    })
}

/// The target a proposed desktop command runs: a detected one when it is the
/// same process, so an approval of one is an approval of the other.
pub fn desktop_target_for(root: &str, command: &DesktopCommand) -> CoreResult<PreviewTarget> {
    let root = canonical_project_root(root)?;
    let custom = custom_target(&root, command)?;
    Ok(detect_project(&root)?
        .into_iter()
        .find(|item| same_process(item, &custom))
        .unwrap_or(custom)
        .target)
}

pub(crate) fn detect_target_with(
    root: &str,
    id: &str,
    custom: &[DesktopCommand],
) -> CoreResult<DetectedTarget> {
    let root = canonical_project_root(root)?;
    detect_with(&root, custom)?
        .into_iter()
        .find(|item| item.target.id == id)
        .ok_or_else(|| {
            CoreError::Preview("preview target changed; inspect the project again".into())
        })
}

fn detect_with(root: &Path, custom: &[DesktopCommand]) -> CoreResult<Vec<DetectedTarget>> {
    let mut targets = detect_project(root)?;
    for command in custom {
        // A command that no longer validates (its script changed, its folder
        // moved) is simply not offered; approval is asked for again.
        let Ok(target) = custom_target(root, command) else {
            continue;
        };
        if !targets.iter().any(|item| same_process(item, &target)) {
            targets.push(target);
        }
    }
    Ok(targets)
}

fn same_process(a: &DetectedTarget, b: &DetectedTarget) -> bool {
    match (&a.recipe, &b.recipe) {
        (LaunchRecipe::Desktop { process: a }, LaunchRecipe::Desktop { process: b }) => {
            a.program == b.program && a.args == b.args && a.cwd == b.cwd
        }
        _ => false,
    }
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
    let discovered = discover(root);
    let candidates = APP_ROOTS
        .iter()
        .map(|relative| {
            if *relative == "." {
                root.to_owned()
            } else {
                root.join(relative)
            }
        })
        .chain(discovered.iter().cloned());
    for (index, candidate) in candidates.enumerate() {
        // Folders found by the walk are real apps or nothing: a stray index.html
        // in a docs or fixtures folder is not a project to preview.
        let deep = index >= APP_ROOTS.len();
        let Ok(candidate) = fs::canonicalize(candidate) else {
            continue;
        };
        if !candidate.is_dir() || !candidate.starts_with(root) || !visited.insert(candidate.clone())
        {
            continue;
        }
        match detect_app_root(root, &candidate, deep) {
            Ok(found) => targets.extend(found),
            Err(error) => targets.push(unsupported_target(
                &relative_label(root, &candidate),
                "Could not inspect app",
                &error.to_string(),
            )),
        }
        if targets.len() >= 12 {
            targets.truncate(12);
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

/// The site first, then any desktop app: a project can offer both.
fn detect_app_root(project: &Path, app: &Path, deep: bool) -> CoreResult<Vec<DetectedTarget>> {
    let relative = relative_label(project, app);
    let web = match detect_laravel(app, &relative)? {
        Some(target) => Some(target),
        None => match detect_package(app, project, &relative)? {
            Some(target) => Some(target),
            None => match detect_stack(app, &relative) {
                Some(target) => Some(target),
                None if deep => None,
                None => detect_static_or_php(app, &relative),
            },
        },
    };
    let desktop = detect_desktop(app, &relative)?;
    // "Cannot run in a browser" says nothing useful once the app itself runs.
    let web =
        web.filter(|item| item.target.framework != "Native desktop app" || desktop.is_empty());
    Ok(web.into_iter().chain(desktop).collect())
}
