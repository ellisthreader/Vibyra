//! Short-lived memory of Git answers the UI asks for on a timer.
//!
//! The Files panel and the worktree view poll every few seconds, and each
//! poll used to spawn `git rev-parse --show-toplevel` before the command that
//! actually answers it. A repository's top level only moves when someone runs
//! `git init` or deletes `.git`, so it is remembered briefly per project.

use std::collections::HashMap;
use std::hash::Hash;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use crate::CoreResult;

/// Enough for every project and worktree a window shows; past it the map is
/// rebuilt rather than grown, so a long session cannot accumulate entries.
const CAPACITY: usize = 64;
const TOPLEVEL_TTL: Duration = Duration::from_secs(30);

pub(super) struct Recent<K, V> {
    ttl: Duration,
    entries: Mutex<HashMap<K, (Instant, V)>>,
}

impl<K: Eq + Hash, V: Clone> Recent<K, V> {
    pub(super) fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            entries: Mutex::new(HashMap::new()),
        }
    }

    pub(super) fn get(&self, key: &K) -> Option<V> {
        let entries = self.entries.lock();
        let (stored, value) = entries.get(key)?;
        (stored.elapsed() < self.ttl).then(|| value.clone())
    }

    pub(super) fn put(&self, key: K, value: V) {
        let mut entries = self.entries.lock();
        if entries.len() >= CAPACITY {
            let ttl = self.ttl;
            entries.retain(|_, (stored, _)| stored.elapsed() < ttl);
            if entries.len() >= CAPACITY {
                entries.clear();
            }
        }
        entries.insert(key, (Instant::now(), value));
    }
}

static TOPLEVELS: LazyLock<Recent<PathBuf, String>> = LazyLock::new(|| Recent::new(TOPLEVEL_TTL));

/// The repository top level for an already-canonical project folder.
pub(super) fn toplevel(project: &Path) -> CoreResult<String> {
    if let Some(root) = TOPLEVELS.get(&project.to_path_buf()) {
        return Ok(root);
    }
    let repo = super::git_changes::git(project, &["rev-parse", "--show-toplevel"], 32_768)?;
    let root = repo.trim_end().to_string();
    TOPLEVELS.put(project.to_path_buf(), root.clone());
    Ok(root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entries_expire_and_capacity_stays_bounded() {
        let recent = Recent::new(Duration::from_millis(30));
        recent.put(1, "one");
        assert_eq!(recent.get(&1), Some("one"));
        std::thread::sleep(Duration::from_millis(40));
        assert_eq!(recent.get(&1), None);
        for key in 0..CAPACITY * 3 {
            recent.put(key, "value");
        }
        assert!(recent.entries.lock().len() <= CAPACITY);
    }
}
