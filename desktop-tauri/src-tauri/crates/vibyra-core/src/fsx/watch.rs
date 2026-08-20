use std::path::Path;
use std::time::Duration;

use notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;

use crate::error::{CoreError, CoreResult};

#[derive(Debug, Clone, Serialize)]
pub struct FsChange {
    pub path: String,
    pub kind: String,
}

/// Build/VCS churn is never user content; a `cargo build` alone can emit
/// thousands of events under `target/` that would each cross IPC.
const IGNORED_DIRS: [&str; 8] = [
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".expo",
    ".venv",
];

/// Caps one batch's payload; consumers treat a batch as "something changed",
/// so completeness past this point buys nothing.
const MAX_CHANGES_PER_BATCH: usize = 128;

fn ignored(path: &Path) -> bool {
    path.components().any(|component| {
        matches!(component, std::path::Component::Normal(name)
            if IGNORED_DIRS.iter().any(|dir| *name == **dir))
    })
}

/// Recursive, debounced filesystem watcher for the workspace root.
/// Events are coalesced in Rust (300 ms) so a `cargo build` or `npm install`
/// storm becomes a handful of IPC messages instead of thousands.
pub struct WorkspaceWatcher {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
    pub root: String,
}

impl WorkspaceWatcher {
    pub fn start(
        root: &str,
        on_changes: impl Fn(Vec<FsChange>) + Send + 'static,
    ) -> CoreResult<Self> {
        let path = Path::new(root);
        if !path.is_dir() {
            return Err(CoreError::InvalidPath(format!("not a directory: {root}")));
        }
        let mut debouncer = new_debouncer(
            Duration::from_millis(300),
            None,
            move |result: DebounceEventResult| {
                let Ok(events) = result else { return };
                let mut seen = std::collections::HashSet::new();
                let mut changes = Vec::new();
                'outer: for event in events {
                    let kind = match event.event.kind {
                        EventKind::Create(_) => "create",
                        EventKind::Remove(_) => "remove",
                        EventKind::Modify(_) => "modify",
                        _ => continue,
                    };
                    for event_path in &event.event.paths {
                        if ignored(event_path) || !seen.insert(event_path.clone()) {
                            continue;
                        }
                        changes.push(FsChange {
                            path: event_path.to_string_lossy().into_owned(),
                            kind: kind.to_string(),
                        });
                        if changes.len() >= MAX_CHANGES_PER_BATCH {
                            break 'outer;
                        }
                    }
                }
                if !changes.is_empty() {
                    on_changes(changes);
                }
            },
        )
        .map_err(|e| CoreError::Watch(e.to_string()))?;
        debouncer
            .watch(path, RecursiveMode::Recursive)
            .map_err(|e| CoreError::Watch(e.to_string()))?;
        Ok(Self {
            _debouncer: debouncer,
            root: root.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn filters_build_directories() {
        assert!(ignored(Path::new("/repo/node_modules/pkg/index.js")));
        assert!(ignored(Path::new("/repo/target/debug/app")));
        assert!(ignored(Path::new("/repo/.git/objects/ab")));
        assert!(!ignored(Path::new("/repo/src/main.rs")));
        assert!(!ignored(Path::new("/repo/targeted/file.txt")));
    }

    #[test]
    fn reports_created_files() {
        let tmp = tempfile::tempdir().unwrap();
        let (tx, rx) = mpsc::channel();
        let watcher = WorkspaceWatcher::start(tmp.path().to_str().unwrap(), move |changes| {
            let _ = tx.send(changes);
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(100));
        std::fs::write(tmp.path().join("new-file.txt"), "hello").unwrap();
        let changes = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(changes.iter().any(|c| c.path.contains("new-file.txt")));
        drop(watcher);
    }
}
