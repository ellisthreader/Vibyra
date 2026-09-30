//! Skipping saves that would write the workspace file back unchanged.
//!
//! The UI saves every 30 s, on every window blur, on pagehide and a second
//! after each layout change, and every save is a full rewrite with an fsync
//! — for idle terminals, the same bytes each time. `savedAtMs` also stands in
//! for the restored panes' "last active" time, so an unchanged workspace is
//! still rewritten once `REWRITE_AFTER` has passed and that time is never
//! more than that stale.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::Hasher;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use vibyra_core::{CoreError, CoreResult};

use super::TerminalSession;

const REWRITE_AFTER: Duration = Duration::from_secs(120);

/// What each session file was last written with, and when. The app writes
/// one file; keying by path keeps separate files from confusing each other.
static WRITTEN: LazyLock<Mutex<HashMap<PathBuf, (u64, Instant)>>> = LazyLock::new(Default::default);

/// Everything a save writes except the time it was taken.
pub(super) fn digest(session: &TerminalSession) -> CoreResult<u64> {
    let mut hasher = Hash(DefaultHasher::new());
    serde_json::to_writer(&mut hasher, &(session.version, &session.panes))
        .map_err(|error| CoreError::Settings(error.to_string()))?;
    Ok(hasher.0.finish())
}

/// Whether `path` already holds exactly this workspace, written recently.
pub(super) fn already_written(path: &Path, digest: u64) -> bool {
    let recent = WRITTEN
        .lock()
        .get(path)
        .is_some_and(|(last, at)| *last == digest && at.elapsed() < REWRITE_AFTER);
    recent && path.exists()
}

pub(super) fn written(path: &Path, digest: u64) {
    WRITTEN
        .lock()
        .insert(path.to_owned(), (digest, Instant::now()));
}

pub(super) fn forget(path: &Path) {
    WRITTEN.lock().remove(path);
}

/// Feeds serialized bytes straight into a hasher, so comparing a save costs
/// no buffer of its own.
struct Hash(DefaultHasher);

impl std::io::Write for Hash {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.write(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::{load, save, PersistedPane, TerminalSession, VERSION};

    fn session(saved_at_ms: u64, title: &str) -> TerminalSession {
        TerminalSession {
            version: VERSION,
            saved_at_ms,
            panes: vec![PersistedPane {
                title: title.into(),
                snapshot: Some("output".into()),
                ..Default::default()
            }],
        }
    }

    #[test]
    fn an_unchanged_workspace_is_not_rewritten_but_a_changed_one_is() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.json");
        save(&path, session(1, "a")).unwrap();
        save(&path, session(2, "a")).unwrap();
        assert_eq!(load(&path).unwrap().saved_at_ms, 1);
        save(&path, session(3, "b")).unwrap();
        assert_eq!(load(&path).unwrap().saved_at_ms, 3);
        // A file removed underneath is written again even though unchanged.
        std::fs::remove_file(&path).unwrap();
        save(&path, session(4, "b")).unwrap();
        assert_eq!(load(&path).unwrap().saved_at_ms, 4);
    }
}
