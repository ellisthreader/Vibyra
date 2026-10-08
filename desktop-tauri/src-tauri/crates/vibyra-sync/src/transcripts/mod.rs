//! `kind=transcripts`: a plain ustar tar of `claude/<id>.jsonl` and `codex/rollout-....jsonl` plus
//! `manifest.json`, at most 5 sessions per provider and 50 MiB per file. Each session recorded the folder it ran
//! in (`cwd`); unpacking rewrites that to the receiving side's project folder.
mod cwd;
mod discover;
mod pack;
mod unpack;
pub use cwd::rewrite_line;
pub use discover::{claude_dir_name, MAX_SESSIONS_PER_PROVIDER, MAX_SESSION_BYTES};
pub use pack::pack;
pub use unpack::unpack;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionMeta {
    /// `claude` or `codex`.
    pub provider: String,
    pub id: String,
    /// The tar entry name.
    pub file: String,
    /// The absolute folder the session recorded.
    pub cwd: String,
    pub mtime: u64,
    /// `cloud` on a session Vibyra Cloud sent back; absent from older cloud runtimes and from this Mac.
    #[serde(default, rename = "ranIn", skip_serializing_if = "Option::is_none")]
    pub ran_in: Option<String>,
    /// Unix seconds of the cloud's last append, when the cloud says.
    #[serde(default, rename = "cloudAt", skip_serializing_if = "Option::is_none")]
    pub cloud_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
    pub project: String,
    pub sessions: Vec<SessionMeta>,
}
