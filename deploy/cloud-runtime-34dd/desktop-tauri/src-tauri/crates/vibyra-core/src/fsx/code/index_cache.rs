//! Recent indexes per root, and a stop flag for each build in flight.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use super::CodeIndex;
use crate::CoreResult;

const TTL: Duration = Duration::from_secs(10);
const CAPACITY: usize = 8;

type Cache = HashMap<PathBuf, (Instant, Arc<CodeIndex>)>;

static CACHE: LazyLock<Mutex<Cache>> = LazyLock::new(Default::default);
static RUNNING: LazyLock<Mutex<HashMap<PathBuf, Arc<AtomicBool>>>> =
    LazyLock::new(Default::default);

fn canonical(root: &Path) -> PathBuf {
    root.canonicalize().unwrap_or_else(|_| root.to_path_buf())
}

/// The index of `root`, reused for a few seconds so opening several views
/// at once walks the tree only once. `cancel_index` stops a build.
pub fn cached_index(root: &Path) -> CoreResult<Arc<CodeIndex>> {
    let root = root.canonicalize()?;
    if let Some((stored, index)) = CACHE.lock().get(&root) {
        if stored.elapsed() < TTL {
            return Ok(Arc::clone(index));
        }
    }
    let flag = Arc::new(AtomicBool::new(false));
    RUNNING.lock().insert(root.clone(), Arc::clone(&flag));
    let built = super::index::build_index(&root, &flag);
    {
        let mut running = RUNNING.lock();
        if running
            .get(&root)
            .is_some_and(|live| Arc::ptr_eq(live, &flag))
        {
            running.remove(&root);
        }
    }
    let index = Arc::new(built?);
    remember(root, Arc::clone(&index));
    Ok(index)
}

fn remember(root: PathBuf, index: Arc<CodeIndex>) {
    let mut cache = CACHE.lock();
    cache.retain(|_, (stored, _)| stored.elapsed() < TTL);
    while cache.len() >= CAPACITY {
        let oldest = cache
            .iter()
            .min_by_key(|(_, (stored, _))| *stored)
            .map(|(key, _)| key.clone());
        match oldest {
            Some(key) => cache.remove(&key),
            None => break,
        };
    }
    cache.insert(root, (Instant::now(), index));
}

/// Stops the build in flight for `root`, if any. Returns whether one was.
pub fn cancel_index(root: &Path) -> bool {
    let root = canonical(root);
    CACHE.lock().remove(&root);
    match RUNNING.lock().get(&root) {
        Some(flag) => {
            flag.store(true, Ordering::Relaxed);
            true
        }
        None => false,
    }
}
