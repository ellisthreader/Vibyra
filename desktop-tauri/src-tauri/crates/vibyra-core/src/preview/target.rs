use std::path::Path;

use super::types::{
    DetectedTarget, LaunchRecipe, PreviewDeviceHint, PreviewTarget, PreviewTargetKind,
};

pub(crate) fn runnable_target(
    relative: &str,
    profile: &str,
    framework: &str,
    device_hint: PreviewDeviceHint,
    landscape: bool,
    command: String,
    recipe: LaunchRecipe,
) -> DetectedTarget {
    DetectedTarget {
        target: PreviewTarget {
            id: target_id(relative, profile),
            name: target_name(relative, framework),
            framework: framework.into(),
            relative_root: relative.into(),
            command: Some(command),
            runnable: true,
            reason: None,
            device_hint,
            landscape,
            kind: PreviewTargetKind::Web,
        },
        recipe,
    }
}

pub(crate) fn unsupported_target(relative: &str, name: &str, reason: &str) -> DetectedTarget {
    DetectedTarget {
        target: PreviewTarget {
            id: target_id(relative, "unsupported"),
            name: target_name(relative, name),
            framework: name.into(),
            relative_root: relative.into(),
            command: None,
            runnable: false,
            reason: Some(reason.into()),
            device_hint: PreviewDeviceHint::Desktop,
            landscape: true,
            kind: PreviewTargetKind::Web,
        },
        recipe: LaunchRecipe::Unsupported,
    }
}

/// An application that runs as a window on the computer, shown on the phone
/// through window Preview rather than the browser frame.
pub(crate) fn desktop_target(
    relative: &str,
    profile: &str,
    framework: &str,
    command: String,
    recipe: LaunchRecipe,
) -> DetectedTarget {
    DetectedTarget {
        target: PreviewTarget {
            id: target_id(relative, profile),
            name: target_name(relative, framework),
            framework: framework.into(),
            relative_root: relative.into(),
            command: Some(command),
            runnable: true,
            reason: None,
            device_hint: PreviewDeviceHint::Desktop,
            landscape: true,
            kind: PreviewTargetKind::Desktop,
        },
        recipe,
    }
}

pub(crate) fn relative_label(project: &Path, app: &Path) -> String {
    app.strip_prefix(project)
        .ok()
        .filter(|path| !path.as_os_str().is_empty())
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| ".".into())
}

fn target_id(relative: &str, profile: &str) -> String {
    format!("{}::{profile}", relative.replace(['/', '\\', ' '], "-"))
}

fn target_name(relative: &str, framework: &str) -> String {
    if relative == "." {
        framework.into()
    } else {
        let leaf = relative.rsplit('/').next().unwrap_or(relative);
        format!("{leaf} · {framework}")
    }
}
