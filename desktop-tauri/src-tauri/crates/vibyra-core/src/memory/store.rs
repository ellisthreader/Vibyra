use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{CoreError, CoreResult};

use super::{vault_candidate, VaultSummary};

/// One vault for the whole app, not one per project.
///
/// It was keyed by project id when the vault backed a per-project Memory
/// panel, which meant connecting the same vault again for every project — a
/// person has one set of notes, not one per repository. The connection is an
/// app-level integration now and lives beside the provider accounts.
#[derive(Debug, Default, Serialize, Deserialize)]
struct MemorySourceStore {
    #[serde(default)]
    vault: Option<PathBuf>,
    /// The per-project map this file used to hold. Read once so an existing
    /// connection survives the move, and never written back.
    #[serde(default, skip_serializing)]
    vaults: HashMap<String, PathBuf>,
}

impl MemorySourceStore {
    fn load(path: &Path) -> Self {
        let mut store: Self = fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        if store.vault.is_none() {
            // Any of them: they were all the same vault in practice, and the
            // project they were filed under no longer means anything here.
            store.vault = store.vaults.values().next().cloned();
        }
        store
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

pub fn load_connected_vault(store_path: &Path) -> CoreResult<Option<PathBuf>> {
    let Some(path) = MemorySourceStore::load(store_path).vault else {
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

pub fn connect_vault(store_path: &Path, vault_path: &Path) -> CoreResult<VaultSummary> {
    let candidate = vault_candidate(vault_path)?;
    let store = MemorySourceStore {
        vault: Some(candidate.path.clone()),
        vaults: HashMap::new(),
    };
    store.save(store_path)?;
    Ok(candidate.summary)
}

pub fn disconnect_vault(store_path: &Path) -> CoreResult<()> {
    MemorySourceStore::default().save(store_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault_at(root: &Path, name: &str) -> PathBuf {
        let vault = root.join(name);
        fs::create_dir_all(vault.join(".obsidian")).unwrap();
        fs::write(vault.join("note.md"), "# Note").unwrap();
        vault
    }

    #[test]
    fn stores_one_native_only_vault_for_the_whole_app() {
        let temp = tempfile::tempdir().unwrap();
        let vault = vault_at(temp.path(), "vault");
        let store = temp.path().join("sources.json");

        let summary = connect_vault(&store, &vault).unwrap();
        assert_eq!(summary.name, "vault");
        assert_eq!(
            load_connected_vault(&store).unwrap(),
            Some(fs::canonicalize(&vault).unwrap())
        );
        disconnect_vault(&store).unwrap();
        assert_eq!(load_connected_vault(&store).unwrap(), None);
    }

    #[test]
    fn a_per_project_connection_survives_the_move_to_one_vault() {
        // The file this ships on top of keyed vaults by project id. Someone
        // upgrading has one in there, and must not have to reconnect.
        let temp = tempfile::tempdir().unwrap();
        let vault = vault_at(temp.path(), "legacy");
        let store = temp.path().join("sources.json");
        fs::write(
            &store,
            format!(
                r#"{{"vaults":{{"p-abc123":{}}}}}"#,
                serde_json::to_string(&vault).unwrap()
            ),
        )
        .unwrap();

        assert_eq!(
            load_connected_vault(&store).unwrap(),
            Some(fs::canonicalize(&vault).unwrap()),
        );
    }

    #[test]
    fn disconnecting_leaves_no_legacy_entry_behind() {
        // The legacy map is never written back, so a disconnect has to clear
        // it rather than let the next load resurrect the connection.
        let temp = tempfile::tempdir().unwrap();
        let vault = vault_at(temp.path(), "legacy");
        let store = temp.path().join("sources.json");
        fs::write(
            &store,
            format!(
                r#"{{"vaults":{{"p-abc123":{}}}}}"#,
                serde_json::to_string(&vault).unwrap()
            ),
        )
        .unwrap();

        disconnect_vault(&store).unwrap();
        assert_eq!(load_connected_vault(&store).unwrap(), None);
    }
}
