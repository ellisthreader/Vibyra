use std::path::Path;
use std::sync::{Arc, Weak};
use std::time::Duration;

use notify::EventKind;
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use parking_lot::Mutex;
use serde::Serialize;

use super::watch_tree::{ignored, new_directories, watch_tree, WorkspaceDebouncer};
use crate::error::{CoreError, CoreResult};

#[derive(Debug, Clone, Serialize)]
pub struct FsChange {
    pub path: String,
    pub kind: String,
}

/// Caps one batch's payload; consumers treat a batch as "something changed",
/// so completeness past this point buys nothing.
const MAX_CHANGES_PER_BATCH: usize = 128;

/// The debouncer, shared with its own event callback so a directory created
/// while watching can be given a watch of its own. `None` only during start-up,
/// before the first batch can possibly arrive.
type Shared = Arc<Mutex<Option<WorkspaceDebouncer>>>;

/// Debounced filesystem watcher for the workspace root, one non-recursive
/// watch per directory that is not build or VCS churn (see `watch_tree`).
/// Events are coalesced in Rust (300 ms) so a `cargo build` or `npm install`
/// storm becomes a handful of IPC messages instead of thousands.
pub struct WorkspaceWatcher {
    _debouncer: Shared,
    pub root: String,
}

fn changes_in(events: &[notify_debouncer_full::DebouncedEvent]) -> Vec<FsChange> {
    let mut seen = std::collections::HashSet::new();
    let mut changes = Vec::new();
    for event in events {
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
                return changes;
            }
        }
    }
    changes
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
        let shared: Shared = Arc::new(Mutex::new(None));
        // Weak, so dropping the watcher is what stops the debouncer, and the
        // callback can never keep it alive past that.
        let handle: Weak<Mutex<Option<WorkspaceDebouncer>>> = Arc::downgrade(&shared);
        let mut debouncer = new_debouncer(
            Duration::from_millis(300),
            None,
            move |result: DebounceEventResult| {
                let Ok(events) = result else { return };
                // The debouncer thread calls this with its own lock released,
                // so registering more watches from here does not contend.
                let created = new_directories(&events);
                if !created.is_empty() {
                    if let Some(shared) = handle.upgrade() {
                        if let Some(debouncer) = shared.lock().as_mut() {
                            for dir in &created {
                                watch_tree(debouncer, dir);
                            }
                        }
                    }
                }
                let changes = changes_in(&events);
                if !changes.is_empty() {
                    on_changes(changes);
                }
            },
        )
        .map_err(|e| CoreError::Watch(e.to_string()))?;
        if watch_tree(&mut debouncer, path) == 0 {
            return Err(CoreError::Watch(format!("could not watch {root}")));
        }
        *shared.lock() = Some(debouncer);
        Ok(Self {
            _debouncer: shared,
            root: root.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn watching(tmp: &Path) -> (WorkspaceWatcher, mpsc::Receiver<Vec<FsChange>>) {
        let (tx, rx) = mpsc::channel();
        let watcher = WorkspaceWatcher::start(tmp.to_str().unwrap(), move |changes| {
            let _ = tx.send(changes);
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(100));
        (watcher, rx)
    }

    fn batch_mentioning(rx: &mpsc::Receiver<Vec<FsChange>>, needle: &str) -> bool {
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while let Ok(changes) =
            rx.recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))
        {
            if changes.iter().any(|c| c.path.contains(needle)) {
                return true;
            }
        }
        false
    }

    #[test]
    fn reports_created_files() {
        let tmp = tempfile::tempdir().unwrap();
        let (watcher, rx) = watching(tmp.path());
        std::fs::write(tmp.path().join("new-file.txt"), "hello").unwrap();
        assert!(batch_mentioning(&rx, "new-file.txt"));
        drop(watcher);
    }

    #[test]
    fn a_directory_created_while_watching_is_watched_too() {
        // Recursive mode did this for free; per-directory watches have to earn
        // it, or a new folder's files go unnoticed until the project reopens.
        let tmp = tempfile::tempdir().unwrap();
        let (watcher, rx) = watching(tmp.path());
        let fresh = tmp.path().join("fresh");
        std::fs::create_dir(&fresh).unwrap();
        assert!(batch_mentioning(&rx, "fresh"));
        std::fs::write(fresh.join("inside.txt"), "hello").unwrap();
        assert!(
            batch_mentioning(&rx, "inside.txt"),
            "a file in a directory created after start-up was not reported",
        );
        drop(watcher);
    }
}
