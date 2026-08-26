use std::path::Path;

use serde::{Deserialize, Serialize};
use vibyra_core::fsx::write_private_atomic;
use vibyra_core::workspace::SafeWorkspaceRef;
use vibyra_core::{CoreError, CoreResult};

// The saved workspace: enough to rebuild the panes, their order and their
// on-screen output, but never a live process. Restored panes come back
// suspended and are relaunched only when the user asks.

pub const VERSION: u32 = 1;

/// Ceilings on what a single save may cost. Terminal output is unbounded in
/// principle — a noisy build loop can fill the 4 MiB scrollback ring of every
/// pane — so the file is capped rather than left to track it.
const MAX_PANES: usize = 24;
const MAX_SNAPSHOT_BYTES: usize = 256 * 1024;
const MAX_TOTAL_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PersistedPane {
    /// Live session id at save time, or 0 for a pane that is already
    /// suspended. Used only to fetch the snapshot during the save itself — it
    /// is never restored, because ids reset to 1 on every launch.
    pub id: u64,
    /// Stable across launches; native PTY ids restart at one every process.
    pub persistence_id: String,
    pub project_id: String,
    pub agent_id: String,
    pub title: String,
    pub custom_title: Option<String>,
    /// Vibyra's prompt-derived title for CLIs that only emit a cwd over OSC.
    pub chat_title: Option<String>,
    pub model: Option<String>,
    pub permission_mode: String,
    pub reasoning_effort: Option<String>,
    pub source_cwd: Option<String>,
    pub workspace_mode: String,
    pub accent: String,
    pub snapshot: Option<String>,
    /// The agent's own conversation id, so Resume names exactly the one this
    /// pane left rather than whichever is newest in the folder.
    pub agent_session_id: Option<String>,
    /// The provider account this pane ran as, so it resumes on the same login.
    /// Absent in files written before accounts existed, which `serde(default)`
    /// reads as the first account — exactly what those panes used.
    pub account_id: Option<String>,
    /// The safe-mode worktree the pane ran in, so its changes can still be
    /// reviewed, merged or discarded after a restart. Absent for shared panes
    /// and in files written before the Review tool existed.
    pub workspace: Option<SafeWorkspaceRef>,
}

/// `version` is deliberately required: a file without one is from an unknown
/// build and is discarded rather than guessed at.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSession {
    pub version: u32,
    #[serde(default)]
    pub saved_at_ms: u64,
    #[serde(default)]
    pub panes: Vec<PersistedPane>,
}

impl Default for TerminalSession {
    fn default() -> Self {
        Self {
            version: VERSION,
            saved_at_ms: 0,
            panes: Vec::new(),
        }
    }
}

/// Keeps the **tail** of the output — the most recent lines are the ones worth
/// reading back — landing on a character boundary so a multi-byte character is
/// never split into invalid UTF-8.
pub fn trim_snapshot(snapshot: String) -> String {
    if snapshot.len() <= MAX_SNAPSHOT_BYTES {
        return snapshot;
    }
    let mut cut = snapshot.len() - MAX_SNAPSHOT_BYTES;
    while cut < snapshot.len() && !snapshot.is_char_boundary(cut) {
        cut += 1;
    }
    snapshot[cut..].to_owned()
}

/** Combines the replayed history kept by the renderer with this PTY's ring. */
pub fn merge_snapshots(base: Option<String>, fresh: Option<String>) -> Option<String> {
    match (base, fresh) {
        (Some(mut base), Some(fresh)) => {
            base.push_str(&fresh);
            Some(base)
        }
        (Some(base), None) => Some(base),
        (None, Some(fresh)) => Some(fresh),
        (None, None) => None,
    }
}

/// Applies every ceiling. Over-budget panes keep their metadata and lose only
/// their snapshot, so a busy workspace still restores its layout in full.
pub fn normalize(mut session: TerminalSession) -> TerminalSession {
    session.version = VERSION;
    session.panes.truncate(MAX_PANES);
    let mut budget = MAX_TOTAL_BYTES;
    for pane in &mut session.panes {
        let Some(snapshot) = pane.snapshot.take() else {
            continue;
        };
        let snapshot = trim_snapshot(snapshot);
        if snapshot.len() > budget {
            continue;
        }
        budget -= snapshot.len();
        pane.snapshot = Some(snapshot);
    }
    session
}

/// A missing, unreadable, corrupt or foreign-version file is not an error —
/// it simply means there is nothing to restore. Never block startup on it.
pub fn load(path: &Path) -> TerminalSession {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return TerminalSession::default();
    };
    match serde_json::from_str::<TerminalSession>(&raw) {
        Ok(session) if session.version == VERSION => session,
        _ => TerminalSession::default(),
    }
}

pub fn save(path: &Path, session: TerminalSession) -> CoreResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let session = normalize(session);
    let raw = serde_json::to_vec_pretty(&session)
        .map_err(|error| CoreError::Settings(error.to_string()))?;
    write_private_atomic(path, &raw)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_millis() as u64)
        .unwrap_or(0)
}

pub fn clear(path: &Path) -> CoreResult<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

#[cfg(test)]
pub(crate) const TEST_MAX_SNAPSHOT_BYTES: usize = MAX_SNAPSHOT_BYTES;
#[cfg(test)]
pub(crate) const TEST_MAX_PANES: usize = MAX_PANES;
