use std::collections::BTreeMap;
use std::path::{Component, Path};

/// Variables that name the AppImage mount itself. They mean nothing to a child
/// process and only mislead tools that look for them.
const OWNED: &[&str] = &["APPDIR", "APPIMAGE", "APPIMAGE_UUID", "ARGV0", "OWD"];

/// What a child needs applied to undo the AppImage's environment capture.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EnvFix {
    /// Variables to drop entirely — everything they named lived in the mount.
    pub remove: Vec<String>,
    /// Variables to rewrite, keeping only the entries outside the mount.
    pub set: Vec<(String, String)>,
}

impl EnvFix {
    pub fn is_empty(&self) -> bool {
        self.remove.is_empty() && self.set.is_empty()
    }
}

/// Plans the fix for one environment.
///
/// The AppImage runtime prepends its mount to every loader search path it
/// knows — `LD_LIBRARY_PATH`, `PYTHONHOME`, `PERLLIB`, `GTK_PATH`, `GST_*`,
/// `XDG_DATA_DIRS`, `PATH` — so the bundled GTK/WebKit stack wins for
/// *Vibyra*. A terminal Vibyra spawns inherits all of it and stops behaving
/// like the user's own shell: `python3` dies with "No module named
/// 'encodings'" because `PYTHONHOME` points at a tree with no stdlib, and
/// anything dynamically linked can bind the bundle's libraries instead of the
/// system's.
///
/// Rather than enumerate the variables a given runtime version happens to set,
/// this drops the *path entries under AppImage mounts* from whatever is present
/// and keeps the rest. Removing every `.mount_*` sibling matters after an
/// in-app relaunch: the new runtime prepends its mount to the old runtime's
/// captured paths, so cleaning only the current `APPDIR` leaves stale bundled
/// libraries in terminals. `XDG_DATA_DIRS` therefore keeps its system entries,
/// while `PYTHONHOME` — which is nothing but a mount — disappears. A build that
/// is not running from an AppImage produces an empty fix and costs nothing.
pub fn plan<I>(appdir: &str, vars: I) -> EnvFix
where
    I: IntoIterator<Item = (String, String)>,
{
    let appdir = appdir.trim_end_matches('/');
    let mut fix = EnvFix::default();
    if appdir.is_empty() {
        return fix;
    }
    // Sorted so the plan — and the tests over it — do not depend on the order
    // the process environment happens to enumerate in.
    let sorted: BTreeMap<String, String> = vars.into_iter().collect();
    for (key, value) in sorted {
        if OWNED.contains(&key.as_str()) {
            fix.remove.push(key);
            continue;
        }
        let kept: Vec<&str> = value
            .split(':')
            .filter(|entry| !entry.is_empty() && !under_appimage_mount(entry, appdir))
            .collect();
        if kept.len() == value.split(':').filter(|entry| !entry.is_empty()).count() {
            continue;
        }
        if kept.is_empty() {
            fix.remove.push(key);
            continue;
        }
        // Record a rewrite only when filtering actually changed the value.
        let rewritten = kept.join(":");
        if rewritten != value {
            fix.set.push((key, rewritten));
        }
    }
    fix
}

/// True when `entry` is inside the current AppImage mount or another AppImage
/// mount beside it. AppImage mount names are direct `.mount_*` children of one
/// temporary directory. Checking path components avoids sweeping up lookalike
/// strings such as `/tmp/.mountains` or legitimate `.mount_*` paths elsewhere.
fn under_appimage_mount(entry: &str, appdir: &str) -> bool {
    let appdir = Path::new(appdir);
    let entry = Path::new(entry);
    if entry == appdir || entry.starts_with(appdir) {
        return true;
    }

    let Some(parent) = appdir.parent() else {
        return false;
    };
    let Some(current_name) = appdir.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    if !current_name.starts_with(".mount_") {
        return false;
    }
    let Ok(relative) = entry.strip_prefix(parent) else {
        return false;
    };
    matches!(
        relative.components().next(),
        Some(Component::Normal(name)) if name.to_string_lossy().starts_with(".mount_")
    )
}

/// The fix for this process, or an empty fix when Vibyra was not launched from
/// an AppImage. Recomputed per spawn: it is a single pass over the environment,
/// and the app itself adds mount-scoped variables after startup.
pub fn current() -> EnvFix {
    let Ok(appdir) = std::env::var("APPDIR") else {
        return EnvFix::default();
    };
    plan(
        &appdir,
        std::env::vars_os()
            .filter_map(|(key, value)| Some((key.into_string().ok()?, value.into_string().ok()?))),
    )
}

#[cfg(test)]
#[path = "appimage_tests.rs"]
mod tests;
