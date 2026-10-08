use crate::snapshot::HeldBack;
use std::path::PathBuf;

/// A project on this Mac. `id` is the app's own project id (it only ever feeds `projectKey`).
#[derive(Debug, Clone)]
pub struct ProjectRef {
    pub id: String,
    /// Display name; the cloud folder name is proposed from it.
    pub name: String,
    pub root: PathBuf,
}

#[derive(Debug, Clone)]
pub struct SyncOptions {
    /// Send `.env`-type files (default off).
    pub include_env: bool,
    /// Also send the project's Claude/Codex conversations (default on).
    pub include_transcripts: bool,
    /// Force a full bundle and upload even if nothing changed.
    pub resync: bool,
    pub max_file_bytes: u64,
    pub max_project_bytes: u64,
    /// Home directory holding `.claude` and `.codex`; `None` = the user's home.
    pub home: Option<PathBuf>,
}

impl Default for SyncOptions {
    fn default() -> Self {
        SyncOptions {
            include_env: false,
            include_transcripts: true,
            resync: false,
            max_file_bytes: crate::snapshot::DEFAULT_MAX_FILE_BYTES,
            max_project_bytes: crate::snapshot::DEFAULT_MAX_PROJECT_BYTES,
            home: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum SyncOutcome {
    /// A code bundle went up (and possibly the transcripts).
    Uploaded {
        seq: u64,
        head: String,
        /// Sealed size of the code upload.
        bytes: u64,
        full: bool,
        held_back: Vec<HeldBack>,
        /// The transcripts seq if conversations went up in the same run.
        transcripts_seq: Option<u64>,
    },
    /// The tree equals the last uploaded one. Transcripts may still have gone up.
    Unchanged {
        held_back: Vec<HeldBack>,
        transcripts_seq: Option<u64>,
    },
    /// Not syncable: `too_large` or `no_files`. The cloud was told.
    Skipped { reason: String },
    /// The cloud computer has not published its key yet (it has never booted); try again later.
    WaitingForCloud,
}

#[derive(Debug, Clone, Default)]
pub struct DownOptions {
    /// Unpack returned conversations into this Mac's `~/.claude` / `~/.codex` (default true).
    pub skip_transcripts: bool,
    pub home: Option<PathBuf>,
}

#[derive(Debug, Clone, Default)]
pub struct DownReport {
    /// New cloud snapshots, one per project (the newest supersedes older ones).
    pub changes: Vec<crate::cloud::CloudChange>,
    pub transcripts_imported: usize,
    /// Blobs for projects this Mac has no local state for (left un-acked).
    pub ignored: Vec<String>,
    /// `(project, message)` for blobs that could not be applied (acked as not applied).
    pub errors: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ApplyOutcome {
    NothingToApply,
    Applied {
        files: Vec<String>,
    },
    /// Mac files that changed since the last snapshot and would be overwritten. Nothing was written.
    Conflicts {
        files: Vec<String>,
    },
}
