use std::fs;
use std::path::{Component, Path};

use serde::Serialize;

use crate::{CoreError, CoreResult};

use super::notes::{collect_note_paths, is_memory_note, read_bounded, relative_note_path};
use super::MAX_VAULT_NOTES;

const MAX_NOTE_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryNoteIndex {
    pub paths: Vec<String>,
    pub limited: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryNoteView {
    pub path: String,
    pub content: String,
}

pub fn index_vault(root: &Path) -> CoreResult<MemoryNoteIndex> {
    let root = canonical_vault(root)?;
    let mut notes = collect_note_paths(&root, MAX_VAULT_NOTES + 1)?;
    let limited = notes.len() > MAX_VAULT_NOTES;
    notes.truncate(MAX_VAULT_NOTES);
    let paths = notes
        .iter()
        .map(|path| relative_note_path(&root, path))
        .collect();
    Ok(MemoryNoteIndex { paths, limited })
}

pub fn read_vault_note(root: &Path, relative: &str) -> CoreResult<MemoryNoteView> {
    let root = canonical_vault(root)?;
    let relative_path = Path::new(relative);
    if relative_path.as_os_str().is_empty()
        || relative_path.is_absolute()
        || relative_path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || !is_memory_note(relative_path)
    {
        return Err(CoreError::InvalidPath("invalid memory note path".into()));
    }
    let joined = root.join(relative_path);
    let metadata = fs::symlink_metadata(&joined)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(CoreError::InvalidPath(
            "memory note is not a regular file".into(),
        ));
    }
    let canonical = fs::canonicalize(&joined)?;
    if !canonical.starts_with(&root) {
        return Err(CoreError::InvalidPath(
            "memory note is outside the vault".into(),
        ));
    }
    let Some(content) = read_bounded(&canonical, MAX_NOTE_BYTES)? else {
        return Err(CoreError::InvalidPath(
            "memory note is too large to preview".into(),
        ));
    };
    Ok(MemoryNoteView {
        path: relative_note_path(&root, &canonical),
        content,
    })
}

fn canonical_vault(root: &Path) -> CoreResult<std::path::PathBuf> {
    let canonical = fs::canonicalize(root)?;
    if !canonical.join(".obsidian").is_dir() {
        return Err(CoreError::InvalidPath(
            "memory source is not an Obsidian vault".into(),
        ));
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexes_relative_paths_and_reads_notes_on_demand() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join(".obsidian")).unwrap();
        fs::create_dir(temp.path().join("Architecture")).unwrap();
        fs::write(temp.path().join("Architecture/Desktop.md"), "# Desktop").unwrap();
        let index = index_vault(temp.path()).unwrap();
        assert_eq!(index.paths, vec!["Architecture/Desktop.md"]);
        let note = read_vault_note(temp.path(), &index.paths[0]).unwrap();
        assert_eq!(note.content, "# Desktop");
        assert!(!note.path.contains(temp.path().to_string_lossy().as_ref()));
    }

    #[test]
    fn rejects_parent_paths_and_symlinks() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join(".obsidian")).unwrap();
        assert!(read_vault_note(temp.path(), "../outside.md").is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/tmp", temp.path().join("linked")).unwrap();
            assert!(read_vault_note(temp.path(), "linked/note.md").is_err());
        }
    }
}
