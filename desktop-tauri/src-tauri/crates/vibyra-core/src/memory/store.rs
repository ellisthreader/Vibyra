use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{CoreError, CoreResult};

use super::{vault_candidate, VaultSummary};

#[derive(Debug, Default, Serialize, Deserialize)]
struct MemorySourceStore {
    vaults: HashMap<String, PathBuf>,
}

impl MemorySourceStore {
    fn load(path: &Path) -> Self {
        fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    fn save(&self, path: &Path) -> CoreResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let raw = serde_json::to_string_pretty(self)
            .map_err(|error| CoreError::Settings(error.to_string()))?;
        fs::write(path, raw)?;
        Ok(())
    }
}

pub fn load_connected_vault(store_path: &Path, project: &str) -> CoreResult<Option<PathBuf>> {
    let store = MemorySourceStore::load(store_path);
    let Some(path) = store.vaults.get(&project_key(project)) else {
        return Ok(None);
    };
    let canonical = fs::canonicalize(path)?;
    if !canonical.join(".obsidian").is_dir() {
        return Err(CoreError::InvalidPath(
            "the connected Obsidian vault is no longer available".into(),
        ));
    }
    Ok(Some(canonical))
}

pub fn connect_vault(
    store_path: &Path,
    project: &str,
    vault_path: &Path,
) -> CoreResult<VaultSummary> {
    let candidate = vault_candidate(vault_path)?;
    let mut store = MemorySourceStore::load(store_path);
    store
        .vaults
        .insert(project_key(project), candidate.path.clone());
    store.save(store_path)?;
    Ok(candidate.summary)
}

pub fn disconnect_vault(store_path: &Path, project: &str) -> CoreResult<()> {
    let mut store = MemorySourceStore::load(store_path);
    store.vaults.remove(&project_key(project));
    store.save(store_path)
}

fn project_key(project: &str) -> String {
    let key: String = project
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(64)
        .collect();
    if key.is_empty() {
        "global".into()
    } else {
        key
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_one_native_only_vault_connection_per_project() {
        let temp = tempfile::tempdir().unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir_all(vault.join(".obsidian")).unwrap();
        fs::write(vault.join("note.md"), "# Note").unwrap();
        let store = temp.path().join("sources.json");

        let summary = connect_vault(&store, "project-1", &vault).unwrap();
        assert_eq!(summary.name, "vault");
        assert_eq!(
            load_connected_vault(&store, "project-1").unwrap(),
            Some(vault)
        );
        disconnect_vault(&store, "project-1").unwrap();
        assert_eq!(load_connected_vault(&store, "project-1").unwrap(), None);
    }
}
