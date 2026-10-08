use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};

use crate::parallel::map_parallel;

use super::{summarize_vault, VaultCandidate};

const MAX_SUGGESTIONS: usize = 8;
const MAX_FALLBACK_FOLDERS: usize = 320;
const MAX_FALLBACK_DEPTH: usize = 2;
/// Bound on how many candidates are inspected before de-duplication. Each
/// inspection walks a whole vault, and de-duplication needs the canonical
/// path a walk produces, so a few extra walks are the price of doing them
/// concurrently. Generous enough that the eight suggestions are unaffected.
const MAX_INSPECTED: usize = MAX_SUGGESTIONS * 4;

pub fn vault_candidate(path: &Path) -> Result<VaultCandidate, crate::CoreError> {
    let canonical = fs::canonicalize(path)?;
    Ok(VaultCandidate {
        summary: summarize_vault(&canonical)?,
        path: canonical,
    })
}

pub fn discover_vaults() -> Vec<VaultCandidate> {
    let registry = dirs::config_dir().map(|path| path.join("obsidian").join("obsidian.json"));
    let mut paths = registry.as_deref().map(registry_paths).unwrap_or_default();
    if paths.is_empty() {
        paths = fallback_paths();
    }
    paths.truncate(MAX_INSPECTED);

    // Summarizing a vault walks its whole note tree. Done one after another
    // this was the slowest step in opening the memory settings pane; the
    // walks are independent, so run them together and keep the sequential
    // de-duplication afterwards.
    let inspected = map_parallel(&paths, |path| vault_candidate(path).ok());

    let mut seen = HashSet::new();
    let mut candidates = Vec::new();
    for candidate in inspected.into_iter().flatten() {
        if seen.insert(candidate.path.clone()) {
            candidates.push(candidate);
        }
        if candidates.len() >= MAX_SUGGESTIONS {
            break;
        }
    }
    candidates.sort_by(|left, right| {
        left.summary
            .name
            .to_ascii_lowercase()
            .cmp(&right.summary.name.to_ascii_lowercase())
    });
    candidates
}

fn registry_paths(registry: &Path) -> Vec<PathBuf> {
    let Ok(raw) = fs::read_to_string(registry) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return Vec::new();
    };
    value
        .get("vaults")
        .and_then(|vaults| vaults.as_object())
        .into_iter()
        .flat_map(|vaults| vaults.values())
        .filter_map(|vault| vault.get("path").and_then(|path| path.as_str()))
        .map(PathBuf::from)
        .collect()
}

fn fallback_paths() -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let roots = [home.join("Documents"), home.join("Desktop")];
    let mut queue: VecDeque<_> = roots.into_iter().map(|path| (path, 0usize)).collect();
    let mut found = Vec::new();
    let mut inspected = 0usize;
    while let Some((folder, depth)) = queue.pop_front() {
        if inspected >= MAX_FALLBACK_FOLDERS {
            break;
        }
        inspected += 1;
        if folder.join(".obsidian").is_dir() {
            found.push(folder);
            continue;
        }
        if depth >= MAX_FALLBACK_DEPTH {
            continue;
        }
        let Ok(read_dir) = fs::read_dir(folder) else {
            continue;
        };
        let mut children: Vec<_> = read_dir.flatten().collect();
        children.sort_by_key(|entry| entry.file_name());
        for child in children {
            let name = child.file_name().to_string_lossy().into_owned();
            let path = child.path();
            let is_directory = fs::symlink_metadata(&path)
                .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
                .unwrap_or(false);
            if is_directory && !name.starts_with('.') {
                queue.push_back((path, depth + 1));
            }
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_obsidian_registry_paths_without_exposing_other_fields() {
        let temp = tempfile::tempdir().unwrap();
        let registry = temp.path().join("obsidian.json");
        fs::write(
            &registry,
            r#"{"vaults":{"one":{"path":"/tmp/notes","open":true}}}"#,
        )
        .unwrap();
        assert_eq!(registry_paths(&registry), vec![PathBuf::from("/tmp/notes")]);
    }
}
