//! Explicit project-local selections, resolved again at every inspection/launch.
use super::types::{DesktopCommand, DetectedTarget, LaunchRecipe, PreviewDeviceHint};
use crate::{CoreError, CoreResult};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct ManualPreview {
    pub path: String,
    pub target: String,
}

pub fn manual_preview_path(root: &Path, relative: &str) -> CoreResult<PathBuf> {
    if relative.len() > 1024
        || relative.contains('\\')
        || relative.contains('\0')
        || Path::new(relative).components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(CoreError::InvalidPath(
            "Choose a path inside this project".into(),
        ));
    }
    let root = root.canonicalize()?;
    let path = root.join(relative).canonicalize()?;
    if !path.starts_with(&root) {
        return Err(CoreError::InvalidPath(
            "The selection leaves this project".into(),
        ));
    }
    Ok(path)
}

/// Returns inert descriptions, never launches or approves anything.
pub fn manual_preview_commands(root: &Path, relative: &str) -> CoreResult<Vec<DesktopCommand>> {
    let root = root.canonicalize()?;
    let path = manual_preview_path(&root, relative)?;
    let targets = if path.is_dir() {
        super::detect::detect_app_root(&root, &path)?
            .into_iter()
            .filter(|entry| entry.target.runnable)
            .map(|entry| entry.target.id)
            .collect()
    } else if html(&path) {
        vec!["file".into()]
    } else {
        return Err(CoreError::Preview(
            "Choose an HTML file or an app folder".into(),
        ));
    };
    let path = super::target::relative_label(&root, &path);
    Ok(targets
        .into_iter()
        .map(|target| DesktopCommand {
            relative_root: ".".into(),
            argv: Vec::new(),
            manual: Some(ManualPreview {
                path: path.clone(),
                target,
            }),
        })
        .collect())
}

pub(super) fn target(root: &Path, selection: &ManualPreview) -> CoreResult<DetectedTarget> {
    let path = manual_preview_path(root, &selection.path)?;
    if path.is_file() && html(&path) && selection.target == "file" {
        let folder = path
            .parent()
            .ok_or_else(|| CoreError::InvalidPath("Missing folder".into()))?;
        let relative = super::target::relative_label(root, folder);
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        let mut target = super::target::runnable_target(
            &relative,
            "manual-html",
            "Static website",
            PreviewDeviceHint::Laptop,
            false,
            format!("Serve {name}"),
            LaunchRecipe::Static {
                root: folder.to_owned(),
                entry: path.clone(),
            },
        );
        // A compact ASCII identity supports spaces/Unicode without colliding with detected entries.
        target.target.id = format!("manual-{:016x}::html", hash(&selection.path));
        target.target.name = name.into_owned();
        return Ok(target);
    }
    if path.is_dir() {
        let mut found = super::detect::detect_app_root(root, &path)?
            .into_iter()
            .find(|entry| entry.target.id == selection.target && entry.target.runnable)
            .ok_or_else(|| {
                CoreError::Preview("This folder's preview changed. Choose it again.".into())
            })?;
        found.target.id = format!(
            "manual-{:016x}::app",
            hash(&format!("{}:{}", selection.path, selection.target))
        );
        return Ok(found);
    }
    Err(CoreError::Preview(
        "This preview selection is no longer available".into(),
    ))
}

fn html(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("html") || s.eq_ignore_ascii_case("htm"))
}
fn hash(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |value, byte| {
        (value ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
    })
}

pub(super) fn command_target(root: &Path, command: &DesktopCommand) -> CoreResult<DetectedTarget> {
    if !command.argv.is_empty() || command.relative_root != "." {
        return Err(CoreError::Preview(
            "Invalid manual preview selection".into(),
        ));
    }
    target(
        root,
        command
            .manual
            .as_ref()
            .ok_or_else(|| CoreError::Preview("Missing selection".into()))?,
    )
}
