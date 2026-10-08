//! What this Mac remembers about the logins it sent: `<state dir>/cloud-sync/logins.json` (0600). Only a
//! SHA-256 of the sent file, the seq, the time and the cloud key it was sealed to; never the contents.
use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ProviderState {
    /// Highest seq this Mac used; never goes back, even after a removal.
    pub seq: u64,
    /// SHA-256 (hex) of the last file content SENT; `None` after a removal.
    pub sent_sha: Option<String>,
    pub sent_at: Option<u64>,
    /// The cloud computer key (public, hex) the last send was sealed to.
    pub sent_key: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct File {
    codex: ProviderState,
    /// Claude's login made for Vibyra Cloud (2026-10-07); Claude is never copied from this Mac.
    claude: ProviderState,
}

/// What the app shows: whether a Codex login is in the cloud from this Mac, and when it went up.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LoginStatus {
    pub sent: bool,
    pub sent_at: Option<u64>,
    pub seq: u64,
}

pub struct LoginStore {
    path: PathBuf,
}

impl LoginStore {
    pub fn new(state_dir: &std::path::Path) -> LoginStore {
        LoginStore {
            path: crate::paths::sync_root(state_dir).join("logins.json"),
        }
    }

    fn file(&self) -> File {
        std::fs::read(&self.path)
            .ok()
            .and_then(|b| serde_json::from_slice::<File>(&b).ok())
            .unwrap_or_default()
    }

    /// The saved Codex state, or a fresh one (an unreadable file starts over; the cloud's seq corrects it).
    pub fn codex(&self) -> ProviderState {
        self.file().codex
    }

    pub fn save_codex(&self, codex: &ProviderState) -> Result<()> {
        self.save("codex", codex)
    }

    /// The saved state for `provider` ("codex" or "claude").
    pub fn provider(&self, provider: &str) -> ProviderState {
        let f = self.file();
        if provider == "claude" {
            f.claude
        } else {
            f.codex
        }
    }

    pub fn save(&self, provider: &str, state: &ProviderState) -> Result<()> {
        let mut f = self.file();
        if provider == "claude" {
            f.claude = state.clone()
        } else {
            f.codex = state.clone()
        }
        crate::fsutil::write_private(&self.path, &serde_json::to_vec_pretty(&f)?)
    }

    pub fn status(&self) -> LoginStatus {
        let c = self.codex();
        LoginStatus {
            sent: c.sent_sha.is_some(),
            sent_at: c.sent_at,
            seq: c.seq,
        }
    }
}
