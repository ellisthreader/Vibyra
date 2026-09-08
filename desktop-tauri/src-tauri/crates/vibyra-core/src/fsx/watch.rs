use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::Arc;
use std::thread::JoinHandle;

use notify::{Event, EventKind, Watcher};
use serde::Serialize;

use crate::error::{CoreError, CoreResult};

#[path = "watch_tree.rs"]
mod tree;
#[path = "watch_worker.rs"]
mod worker;

#[derive(Debug, Clone, Serialize)]
pub struct FsChange {
    pub path: String,
    pub kind: String,
}

fn ignored(path: &Path) -> bool {
    path.components().any(|part| {
        matches!(part, std::path::Component::Normal(name)
            if ["node_modules", "vendor", ".git", ".vibyra-agent", "target",
                "dist", "build", ".next", ".expo", ".venv"].iter().any(|item| name == *item))
    })
}

pub struct WorkspaceWatcher {
    stop: Arc<AtomicBool>,
    wake: SyncSender<Option<Event>>,
    worker: Option<JoinHandle<()>>,
    pub root: String,
}

impl WorkspaceWatcher {
    pub fn start(
        root: &str,
        on_changes: impl Fn(Vec<FsChange>) + Send + 'static,
    ) -> CoreResult<Self> {
        let root_path = Path::new(root).to_path_buf();
        if !root_path.is_dir() {
            return Err(CoreError::InvalidPath(format!("not a directory: {root}")));
        }
        let (tx, rx) = sync_channel(256);
        let stop = Arc::new(AtomicBool::new(false));
        let overflow = Arc::new(AtomicBool::new(false));
        let callback_tx = tx.clone();
        let callback_overflow = Arc::clone(&overflow);
        let callback_root = root_path.clone();
        let mut watcher = notify::RecommendedWatcher::new(
            move |result: notify::Result<Event>| match result {
                Ok(event)
                    if matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                    ) =>
                {
                    if event
                        .paths
                        .iter()
                        .all(|path| ignored(path.strip_prefix(&callback_root).unwrap_or(path)))
                    {
                        return;
                    }
                    if callback_tx.try_send(Some(event)).is_err() {
                        callback_overflow.store(true, Ordering::Release);
                    }
                }
                Err(_) => {
                    callback_overflow.store(true, Ordering::Release);
                }
                _ => {}
            },
            notify::Config::default(),
        )
        .map_err(|error| CoreError::Watch(error.to_string()))?;
        let mut tree = tree::RegisteredTree::new(root_path);
        tree.refresh(&mut watcher)
            .map_err(|error| CoreError::Watch(error.to_string()))?;
        let worker_stop = Arc::clone(&stop);
        let worker = std::thread::Builder::new()
            .name("vibyra-workspace-watch".into())
            .spawn(move || worker::run(watcher, tree, rx, worker_stop, overflow, on_changes))?;
        Ok(Self {
            stop,
            wake: tx,
            worker: Some(worker),
            root: root.to_string(),
        })
    }
}

impl Drop for WorkspaceWatcher {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = self.wake.try_send(None);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[cfg(test)]
#[path = "watch_tests.rs"]
mod tests;
