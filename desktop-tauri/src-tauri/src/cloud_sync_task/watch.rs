//! One file watcher per synced project, all feeding the worker's message queue.
//! They are the same `WorkspaceWatcher` the code view uses (so the ignore list for
//! `node_modules`, `.git`, `target` and friends is shared by construction); the 15 s
//! debounce lives in the scheduler, on top of the watcher's own 300 ms batching.

use std::collections::HashMap;
use std::sync::mpsc::Sender;

use vibyra_core::fsx::WorkspaceWatcher;

use super::worker::Msg;

#[derive(Default)]
pub struct Watchers {
    by_root: HashMap<String, (String, WorkspaceWatcher)>,
    /// Folders that could not be watched (missing, unreadable), by project id.
    pub failed: HashMap<String, String>,
}

impl Watchers {
    /// Starts watchers for new `(id, root)` pairs and drops the ones no longer wanted.
    pub fn reconcile(&mut self, wanted: &[(String, String)], tx: &Sender<Msg>) {
        self.by_root
            .retain(|root, (id, _)| wanted.iter().any(|(wid, wroot)| wroot == root && wid == id));
        self.failed
            .retain(|id, _| wanted.iter().any(|(wid, _)| wid == id));
        for (id, root) in wanted {
            if self.by_root.contains_key(root) {
                continue;
            }
            let tx = tx.clone();
            let project = id.clone();
            let started = WorkspaceWatcher::start(root, move |_changes| {
                let _ = tx.send(Msg::Changed(project.clone()));
            });
            match started {
                Ok(watcher) => {
                    self.failed.remove(id);
                    self.by_root.insert(root.clone(), (id.clone(), watcher));
                }
                Err(error) => {
                    self.failed.insert(id.clone(), error.to_string());
                }
            }
        }
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.by_root.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;
    use std::time::Duration;

    #[test]
    fn a_change_in_a_watched_project_reaches_the_queue_and_dropped_roots_stop() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let (tx, rx) = channel();
        let mut watchers = Watchers::default();
        let wanted = vec![
            ("a".to_string(), a.path().to_string_lossy().into_owned()),
            ("b".to_string(), b.path().to_string_lossy().into_owned()),
            ("gone".to_string(), "/definitely/not/a/folder".to_string()),
        ];
        watchers.reconcile(&wanted, &tx);
        assert_eq!(watchers.len(), 2);
        assert!(watchers.failed.contains_key("gone"));
        std::thread::sleep(Duration::from_millis(150));
        std::fs::write(a.path().join("file.txt"), "x").unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            let left = deadline.saturating_duration_since(std::time::Instant::now());
            match rx
                .recv_timeout(left)
                .expect("no change message for project a")
            {
                Msg::Changed(id) if id == "a" => break,
                _ => {}
            }
        }
        watchers.reconcile(&wanted[1..2], &tx);
        assert_eq!(watchers.len(), 1);
    }

    #[test]
    fn ignored_folders_do_not_wake_the_queue() {
        let a = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(a.path().join("node_modules/x")).unwrap();
        let (tx, rx) = channel();
        let mut watchers = Watchers::default();
        watchers.reconcile(
            &[("a".into(), a.path().to_string_lossy().into_owned())],
            &tx,
        );
        std::thread::sleep(Duration::from_millis(150));
        std::fs::write(a.path().join("node_modules/x/index.js"), "x").unwrap();
        while rx.recv_timeout(Duration::from_millis(800)).is_ok() {
            // setup noise (the directory events themselves) may arrive; only files inside matter
        }
        std::fs::write(a.path().join("node_modules/x/more.js"), "y").unwrap();
        assert!(
            rx.recv_timeout(Duration::from_millis(1_200)).is_err(),
            "node_modules churn is ignored"
        );
    }
}
