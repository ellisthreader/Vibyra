//! The code view's native side: scoped reads, hash-guarded atomic saves, the
//! HEAD version of a file, one file across worktrees, a columnar file index,
//! and per-project review comments. Every path is checked against its root.

mod base;
mod comments;
mod file;
mod index;
mod index_cache;
mod instructions;
mod links;
mod matcher;
mod replace;
mod scope;
mod search;
mod search_lines;
mod trash;
mod tree_ops;

pub use base::{base, versions};
pub use comments::{load_comments, save_comments};
pub use file::{read_file, write_file};
pub use index::build_index;
pub use index_cache::{cached_index, cancel_index};
pub use instructions::{list_instructions, prepare_write, InstructionFile};
pub use matcher::SearchOptions;
pub use replace::{replace_in_files, ReplaceResult, ReplaceTarget};
pub use scope::resolve_in_root;
pub use search::{search, SearchReport};
pub use trash::move_to_trash;
pub use tree_ops::{create_entry, delete_entry, move_entry, Changed, EntryKind};

use serde::Serialize;

/// Larger files are never opened or written by the code view.
pub const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
/// Larger files are shown but never edited.
pub const EDIT_LIMIT_BYTES: u64 = 2 * 1024 * 1024;
/// Prefix of the error a save returns when the file changed since it was read.
pub const CONFLICT_PREFIX: &str = "code-conflict:";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeFile {
    pub path: String,
    pub rel_path: String,
    pub text: String,
    pub hash: String,
    pub size: u64,
    pub binary: bool,
    pub lossy: bool,
    pub read_only: bool,
    pub mtime_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeSaved {
    pub hash: String,
    pub size: u64,
    pub mtime_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeBase {
    pub text: Option<String>,
    pub commit: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeVersion {
    pub root: String,
    pub text: Option<String>,
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeVersions {
    pub base: CodeBase,
    pub versions: Vec<CodeVersion>,
}

/// Columnar so a large tree crosses IPC as a few arrays. Entry 0 is the root
/// (parent -1); a parent always precedes its children. kinds: 0 file, 1 dir.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeIndex {
    pub root: String,
    pub truncated: bool,
    pub names: Vec<String>,
    pub parents: Vec<i32>,
    pub kinds: Vec<u8>,
    pub sizes: Vec<u64>,
}

/// Lowercase hex SHA-256.
pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex(&Sha256::digest(bytes))
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::with_capacity(64), |mut out, b| {
        let _ = write!(out, "{b:02x}");
        out
    })
}

fn mtime_ms(meta: &std::fs::Metadata) -> Option<u64> {
    let modified = meta.modified().ok()?;
    let since = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(since.as_millis() as u64)
}

#[cfg(test)]
mod test_git;
