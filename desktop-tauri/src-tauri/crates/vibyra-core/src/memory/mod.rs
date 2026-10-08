mod browser;
mod discovery;
mod notes;
mod search;
mod store;

use std::path::PathBuf;

use serde::Serialize;

pub use browser::{index_vault, read_vault_note, MemoryNoteIndex, MemoryNoteView};
pub use discovery::{discover_vaults, vault_candidate};
pub use notes::{read_imported_notes, summarize_vault};
pub use search::search_vault;
pub use store::{connect_vault, disconnect_vault, load_connected_vault};

pub(crate) const NOTE_EXTENSIONS: &[&str] = &["md", "markdown", "txt"];
pub(crate) const MAX_VAULT_NOTES: usize = 2_000;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultSummary {
    pub id: String,
    pub name: String,
    pub location: String,
    pub note_count: usize,
    pub count_limited: bool,
}

#[derive(Debug, Clone)]
pub struct VaultCandidate {
    pub path: PathBuf,
    pub summary: VaultSummary,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedMemoryNote {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryImportBatch {
    pub notes: Vec<ImportedMemoryNote>,
    pub skipped: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnippet {
    pub path: String,
    pub content: String,
}
