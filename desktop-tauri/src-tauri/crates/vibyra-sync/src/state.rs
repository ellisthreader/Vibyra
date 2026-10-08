//! Per-project JSON state at `<state dir>/cloud-sync/<projectKey>/state.json`, written atomically.
use crate::cloud::CloudChange;
use crate::error::Result;
use crate::snapshot::{HeldBack, Skipped};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectState {
    pub project_key: String,
    /// The folder name the cloud granted (`/data/projects/<name>`); empty until the first sync.
    pub name: String,
    /// The Mac folder this state belongs to.
    pub root: String,
    /// Last `code` seq the cloud accepted, and the head/tree of that snapshot.
    pub up_seq: u64,
    pub up_head: Option<String>,
    pub up_tree: Option<String>,
    pub up_at: Option<u64>,
    pub transcripts_seq: u64,
    /// SHA-256 of the last transcripts tar uploaded (plaintext), to skip unchanged ones.
    pub transcripts_sha: Option<String>,
    /// When conversations were last uploaded (unix seconds): they go up at most every `TRANSCRIPTS_GAP_SECS`.
    pub transcripts_at: Option<u64>,
    /// Files kept out of the last snapshot because they look like secrets.
    pub held_back: Vec<HeldBack>,
    pub skipped: Vec<Skipped>,
    /// Why the project is not synced (`too_large`, `no_files`), if so.
    pub skipped_reason: Option<String>,
    pub last_error: Option<String>,
    /// The cloud reported it kept unsynced edits it would have overwritten.
    pub diverged: bool,
    /// Cloud changes fetched into the shadow repo and not dismissed yet.
    pub cloud: Vec<CloudChange>,
    /// Conversations Vibyra Cloud continued and sent back, newest first.
    pub returned: Vec<crate::returned::ReturnedSession>,
    /// The newest `cloudAt` the person has seen the notice for.
    pub returned_seen_at: u64,
}

pub struct Store {
    root: PathBuf,
}

impl Store {
    pub fn new(state_dir: &Path) -> Store {
        Store {
            root: crate::paths::sync_root(state_dir),
        }
    }

    fn file(&self, key: &str) -> PathBuf {
        self.root.join(key).join("state.json")
    }

    /// The saved state, or a fresh one. A file that cannot be parsed is set aside as `state.json.corrupt`
    /// rather than deleted, and the project starts over (the cloud's `GET /` corrects the seq).
    pub fn load(&self, key: &str) -> ProjectState {
        let path = self.file(key);
        let fresh = || ProjectState {
            project_key: key.to_string(),
            ..Default::default()
        };
        match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice::<ProjectState>(&bytes).unwrap_or_else(|_| {
                let _ = std::fs::rename(&path, path.with_extension("json.corrupt"));
                fresh()
            }),
            Err(_) => fresh(),
        }
    }

    pub fn save(&self, state: &ProjectState) -> Result<()> {
        let bytes = serde_json::to_vec_pretty(state)?;
        crate::fsutil::write_atomic(&self.file(&state.project_key), &bytes)
    }

    /// Every project with saved state.
    pub fn all(&self) -> Vec<ProjectState> {
        let Ok(dir) = std::fs::read_dir(&self.root) else {
            return vec![];
        };
        let mut out: Vec<ProjectState> = dir
            .flatten()
            .filter(|e| e.path().join("state.json").is_file())
            .map(|e| self.load(&e.file_name().to_string_lossy()))
            .collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out
    }

    /// The project the cloud knows as `name`.
    pub fn find_by_name(&self, name: &str) -> Option<ProjectState> {
        self.all().into_iter().find(|s| s.name == name)
    }

    /// Forgets a project: state, shadow repo and scratch files.
    pub fn remove(&self, key: &str) {
        let _ = std::fs::remove_dir_all(self.root.join(key));
    }
}
