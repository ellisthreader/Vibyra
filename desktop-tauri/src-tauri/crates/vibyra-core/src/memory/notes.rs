use std::collections::{hash_map::DefaultHasher, VecDeque};
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::{CoreError, CoreResult};

use super::{VaultSummary, MAX_VAULT_NOTES, NOTE_EXTENSIONS};

const SKIPPED_DIRECTORIES: &[&str] = &[
    ".git",
    ".obsidian",
    ".trash",
    "node_modules",
    "vendor",
    "target",
    "dist",
    "build",
];

pub(crate) fn is_memory_note(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| NOTE_EXTENSIONS.contains(&value.to_ascii_lowercase().as_str()))
}

pub(crate) fn collect_note_paths(root: &Path, limit: usize) -> CoreResult<Vec<PathBuf>> {
    if !root.is_dir() {
        return Err(CoreError::InvalidPath(
            "memory source is not a folder".into(),
        ));
    }
    let mut folders = VecDeque::from([root.to_path_buf()]);
    let mut notes = Vec::new();
    while let Some(folder) = folders.pop_front() {
        let Ok(read_dir) = fs::read_dir(folder) else {
            continue;
        };
        let mut entries: Vec<_> = read_dir.flatten().collect();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let path = entry.path();
            let Ok(metadata) = fs::symlink_metadata(&path) else {
                continue;
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if !name.starts_with('.') && !SKIPPED_DIRECTORIES.contains(&name.as_str()) {
                    folders.push_back(path);
                }
            } else if metadata.is_file() && is_memory_note(&path) {
                notes.push(path);
                if notes.len() >= limit {
                    return Ok(notes);
                }
            }
        }
    }
    Ok(notes)
}

pub(crate) fn read_bounded(path: &Path, max_bytes: u64) -> CoreResult<Option<String>> {
    if fs::metadata(path)?.len() > max_bytes {
        return Ok(None);
    }
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > max_bytes {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&bytes).into_owned()))
}

pub fn summarize_vault(path: &Path) -> CoreResult<VaultSummary> {
    let canonical = fs::canonicalize(path)?;
    if !canonical.join(".obsidian").is_dir() {
        return Err(CoreError::InvalidPath(
            "choose an Obsidian vault folder containing .obsidian".into(),
        ));
    }
    let notes = collect_note_paths(&canonical, MAX_VAULT_NOTES + 1)?;
    let mut hasher = DefaultHasher::new();
    canonical.hash(&mut hasher);
    Ok(VaultSummary {
        id: format!("vault-{:016x}", hasher.finish()),
        name: canonical
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Obsidian vault")
            .to_string(),
        location: friendly_location(&canonical),
        note_count: notes.len().min(MAX_VAULT_NOTES),
        count_limited: notes.len() > MAX_VAULT_NOTES,
    })
}

pub(crate) fn relative_note_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn friendly_location(path: &Path) -> String {
    let Some(home) = dirs::home_dir() else {
        return "Local folder".into();
    };
    let Ok(relative) = path.strip_prefix(home) else {
        return "Local folder".into();
    };
    relative
        .components()
        .next()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .filter(|part| !part.is_empty())
        .unwrap_or_else(|| "Home".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_notes_without_hidden_or_generated_folders() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join(".obsidian")).unwrap();
        fs::create_dir(temp.path().join("node_modules")).unwrap();
        fs::create_dir(temp.path().join("notes")).unwrap();
        fs::write(temp.path().join("notes/keep.md"), "# Keep").unwrap();
        fs::write(temp.path().join("node_modules/skip.md"), "# Skip").unwrap();
        let summary = summarize_vault(temp.path()).unwrap();
        assert_eq!(summary.note_count, 1);
    }
}
