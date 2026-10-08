//! Crash leftovers. A run folder (`vibyra-agent-*`) holds that run's broker
//! configuration, so one that outlived its run (the app crashed or was killed)
//! is swept at the next start instead of lingering in the temp directory.

use std::path::Path;
use std::time::{Duration, SystemTime};

pub const PREFIX: &str = "vibyra-agent-";
/// A live run touches `ctl/alive` every few seconds; quiet this long is a leftover.
const STALE: Duration = Duration::from_secs(5 * 60);

#[cfg(unix)]
fn ours(meta: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    // SAFETY: geteuid has no preconditions.
    meta.uid() == unsafe { libc::geteuid() }
}

#[cfg(not(unix))]
fn ours(_: &std::fs::Metadata) -> bool {
    true
}

/// Removes stale run folders under `base`; returns how many. Only real folders
/// this user owns, named like a run folder and laid out like one (`ctl/`), are
/// touched; links are never followed.
pub fn sweep(base: &Path, stale: Duration, now: SystemTime) -> usize {
    let Ok(entries) = std::fs::read_dir(base) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        if !entry.file_name().to_string_lossy().starts_with(PREFIX) {
            continue;
        }
        let path = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if !meta.is_dir() || meta.file_type().is_symlink() || !ours(&meta) {
            continue;
        }
        if !path.join("ctl").is_dir() {
            continue;
        }
        let alive = std::fs::metadata(path.join("ctl").join("alive")).and_then(|m| m.modified());
        let touched = [meta.modified().ok(), alive.ok()]
            .into_iter()
            .flatten()
            .max();
        let quiet = touched
            .and_then(|at| now.duration_since(at).ok())
            .is_some_and(|age| age > stale);
        if quiet && std::fs::remove_dir_all(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// The startup sweep of the private run folder base and this user's temp directory.
pub fn sweep_stale() -> usize {
    let now = SystemTime::now();
    let private = super::workspace::private_base().map_or(0, |dir| sweep(dir, STALE, now));
    private + sweep(&std::env::temp_dir(), STALE, now)
}

#[cfg(test)]
#[path = "workspace_sweep_tests.rs"]
mod tests;
