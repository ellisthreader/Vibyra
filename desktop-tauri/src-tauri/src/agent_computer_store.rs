use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Grant {
    pub id: String,
    pub agent_id: String,
    pub host_id: String,
    pub account_scope: String,
    pub label: String,
    pub path: PathBuf,
    #[serde(default)]
    pub source_path: Option<PathBuf>,
    #[serde(default)]
    pub can_write: bool,
    #[serde(default)]
    pub revoked: bool,
}

impl Grant {
    pub fn validate_path(&self) -> Result<(), String> {
        if self
            .path
            .canonicalize()
            .map_err(|_| "The granted folder is unavailable")?
            != self.path
        {
            return Err("The granted folder changed. Choose it again on this Mac.".into());
        }
        if self.can_write && self.source_path.is_none() {
            return Err(
                "Choose this edit folder again to use the current Mac safety rules.".into(),
            );
        }
        if let Some(source) = &self.source_path {
            if source
                .canonicalize()
                .map_err(|_| "The original folder is unavailable")?
                != *source
            {
                return Err("The original folder changed. Choose it again on this Mac.".into());
            }
        }
        Ok(())
    }
}

pub fn path(settings: &Path) -> Result<PathBuf, String> {
    Ok(settings
        .parent()
        .ok_or("No Vibyra settings directory")?
        .join("agent-computer.json"))
}

pub fn load(file: &Path) -> Result<Vec<Grant>, String> {
    let metadata = match std::fs::symlink_metadata(file) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Agent Computer grant store is not a regular file".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err("Agent Computer grant store must be private (0600)".into());
        }
    }
    serde_json::from_slice(&std::fs::read(file).map_err(|e| e.to_string())?)
        .map_err(|_| "Agent Computer grant store is damaged; no tools will run".into())
}

pub fn active_worktree(file: &Path, scope: &str, id: &str) -> Result<Grant, String> {
    let grant = load(file)?
        .into_iter()
        .find(|grant| grant.id == id && grant.account_scope == scope && !grant.revoked)
        .ok_or("This worktree is no longer granted on this Mac.")?;
    if !grant
        .source_path
        .as_ref()
        .is_some_and(|source| source != &grant.path)
    {
        return Err("This grant has no separate worktree.".into());
    }
    Ok(grant)
}

pub fn save(file: &Path, grants: &[Grant]) -> Result<(), String> {
    let parent = file.parent().ok_or("No Agent Computer state directory")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut random = [0u8; 8];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let pending = parent.join(format!("agent-computer-{}.pending", hex(&random)));
    let write = (|| {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut output = options.open(&pending).map_err(|e| e.to_string())?;
        output
            .write_all(&serde_json::to_vec(grants).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        output.sync_all().map_err(|e| e.to_string())?;
        std::fs::rename(&pending, file).map_err(|e| e.to_string())?;
        std::fs::File::open(parent)
            .and_then(|dir| dir.sync_all())
            .map_err(|e| e.to_string())
    })();
    if write.is_err() {
        let _ = std::fs::remove_file(&pending);
    }
    write
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn damaged_or_exposed_store_fails_closed() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("grants.json");
        save(&file, &[]).unwrap();
        assert!(load(&file).unwrap().is_empty());
        std::fs::write(&file, "not json").unwrap();
        assert!(load(&file).is_err());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
            assert!(load(&file).is_err());
        }
    }

    #[test]
    fn legacy_edit_grant_requires_a_new_folder_choice() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let mut grant = Grant {
            id: "workspace".into(),
            agent_id: "agent".into(),
            host_id: "host".into(),
            account_scope: "account".into(),
            label: "Project".into(),
            path: root.clone(),
            source_path: None,
            can_write: true,
            revoked: false,
        };
        assert!(grant.validate_path().is_err());
        grant.source_path = Some(root);
        assert!(grant.validate_path().is_ok());
    }

    #[test]
    fn worktree_lookup_uses_the_current_account_and_local_grant() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source");
        let worktree = dir.path().join("worktree");
        std::fs::create_dir(&source).unwrap();
        std::fs::create_dir(&worktree).unwrap();
        let mut grant = Grant {
            id: "workspace".into(),
            agent_id: "agent".into(),
            host_id: "host".into(),
            account_scope: "account".into(),
            label: "Project".into(),
            path: worktree.canonicalize().unwrap(),
            source_path: Some(source.canonicalize().unwrap()),
            can_write: true,
            revoked: false,
        };
        let file = dir.path().join("grants.json");
        save(&file, &[grant.clone()]).unwrap();
        assert_eq!(
            active_worktree(&file, "account", "workspace").unwrap(),
            grant
        );
        assert!(active_worktree(&file, "another", "workspace").is_err());
        grant.revoked = true;
        save(&file, &[grant]).unwrap();
        assert!(active_worktree(&file, "account", "workspace").is_err());
    }
}
