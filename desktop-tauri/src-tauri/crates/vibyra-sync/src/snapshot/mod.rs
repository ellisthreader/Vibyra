//! A snapshot is a commit holding the project's FULL tree (tracked + untracked, ignored files excluded, secrets
//! held back, `.git` excluded, symlinks and nested repositories skipped), chained on the previous snapshot in a
//! bare shadow repo that lives outside the project folder. Built with git plumbing and a throwaway index.
mod build;
mod files;
mod objects;
pub use build::take_snapshot;
pub use objects::blob_sha;

use serde::{Deserialize, Serialize};

pub const SNAP_REF: &str = "refs/vibyra/snap";
pub const DEFAULT_MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;
pub const DEFAULT_MAX_PROJECT_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct SnapshotOptions {
    /// Send `.env`-type files (private keys, tokens and credential files are held back regardless).
    pub include_env: bool,
    pub max_file_bytes: u64,
    /// Total bytes of files that would be tracked; above it the project is not synced (`TooLarge`).
    pub max_project_bytes: u64,
}

impl Default for SnapshotOptions {
    fn default() -> Self {
        SnapshotOptions {
            include_env: false,
            max_file_bytes: DEFAULT_MAX_FILE_BYTES,
            max_project_bytes: DEFAULT_MAX_PROJECT_BYTES,
        }
    }
}

/// A file that was NOT sent because it looks like a secret.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeldBack {
    pub path: String,
    pub reason: String,
}

/// A file that was NOT sent for a non-secret reason (over the per-file cap, symlink, ...).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Skipped {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct Snapshot {
    /// The snapshot commit (`refs/vibyra/snap` points at it).
    pub commit: String,
    pub tree: String,
    pub parent: Option<String>,
    /// False when the tree equals the previous snapshot's: `commit` is then that previous snapshot.
    pub created: bool,
    pub held_back: Vec<HeldBack>,
    pub skipped: Vec<Skipped>,
    pub files: usize,
    pub bytes: u64,
}

#[derive(Debug, Clone)]
pub enum SnapshotOutcome {
    Taken(Snapshot),
    /// Nothing syncable (empty folder, or everything held back).
    NoFiles {
        held_back: Vec<HeldBack>,
    },
    /// The files to track add up to more than `max_project_bytes`.
    TooLarge {
        bytes: u64,
        cap: u64,
    },
}
