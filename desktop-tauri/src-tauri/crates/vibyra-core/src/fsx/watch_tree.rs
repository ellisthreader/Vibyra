//! Which directories the workspace watcher registers, and how.
//!
//! `notify`'s recursive mode puts an inotify watch on every directory under the
//! root, ignore list or not — 9,430 of them on the Vibyra repo, most under
//! node_modules, .git and target, whose *events* the watcher then throws away.
//! Each watch is kernel memory and a syscall; each event they raise is work the
//! debouncer does before the filter can drop it; and the debouncer's file-id
//! cache stats every file under a recursive root at start-up. Walking the tree
//! here with one non-recursive watch per directory skips those subtrees whole.

use std::path::{Path, PathBuf};

use notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{DebouncedEvent, Debouncer, RecommendedCache};

/// Build/VCS churn is never user content; a `cargo build` alone can emit
/// thousands of events under `target/` that would each cross IPC.
const IGNORED_DIRS: [&str; 10] = [
    "node_modules",
    "vendor",
    ".git",
    ".vibyra-agent",
    "target",
    "dist",
    "build",
    ".next",
    ".expo",
    ".venv",
];

pub(super) fn ignored(path: &Path) -> bool {
    path.components().any(|component| {
        matches!(component, std::path::Component::Normal(name)
            if IGNORED_DIRS.iter().any(|dir| *name == **dir))
    })
}

pub(super) type WorkspaceDebouncer = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

/// Watches `root` and every directory below it that is not ignored, one
/// non-recursive watch each, and returns how many were registered.
///
/// Symlinks are not followed: a link back up the tree would otherwise loop,
/// and `notify` itself does not follow them either.
pub(super) fn watch_tree(debouncer: &mut WorkspaceDebouncer, root: &Path) -> usize {
    let mut watched = 0;
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        if debouncer.watch(&dir, RecursiveMode::NonRecursive).is_err() {
            continue;
        }
        watched += 1;
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if !kind.is_dir() {
                continue;
            }
            let path = entry.path();
            if !ignored(&path) {
                pending.push(path);
            }
        }
    }
    watched
}

/// Directories that appeared in this batch and need watches of their own.
///
/// Recursive mode did this inside `notify`; with per-directory watches it is
/// ours to do. A rename into the tree arrives as a name change, so both kinds
/// count. Whether the path is a directory is checked now, not from the event:
/// a file created and deleted inside one debounce window is simply gone.
pub(super) fn new_directories(events: &[DebouncedEvent]) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for event in events {
        let appeared = matches!(
            event.event.kind,
            EventKind::Create(_) | EventKind::Modify(notify::event::ModifyKind::Name(_))
        );
        if !appeared {
            continue;
        }
        for path in &event.event.paths {
            if path.is_dir() && !ignored(path) && !found.contains(path) {
                found.push(path.clone());
            }
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn filters_build_directories() {
        assert!(ignored(Path::new("/repo/node_modules/pkg/index.js")));
        assert!(ignored(Path::new("/repo/vendor/composer/autoload.php")));
        assert!(ignored(Path::new("/repo/.vibyra-agent/runs/latest.txt")));
        assert!(ignored(Path::new("/repo/target/debug/app")));
        assert!(ignored(Path::new("/repo/.git/objects/ab")));
        assert!(!ignored(Path::new("/repo/src/main.rs")));
        assert!(!ignored(Path::new("/repo/targeted/file.txt")));
    }

    #[test]
    fn ignored_subtrees_are_never_registered() {
        let tmp = tempfile::tempdir().unwrap();
        for dir in [
            "src/lib",
            "node_modules/pkg/dist",
            ".git/objects/ab",
            "target/debug",
        ] {
            std::fs::create_dir_all(tmp.path().join(dir)).unwrap();
        }
        let mut debouncer =
            notify_debouncer_full::new_debouncer(Duration::from_millis(300), None, |_| {}).unwrap();
        // The root, src and src/lib — and none of the 30-odd directories a
        // real node_modules or .git would have added under recursive mode.
        assert_eq!(watch_tree(&mut debouncer, tmp.path()), 3);
    }
}
