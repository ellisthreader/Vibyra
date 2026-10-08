use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[path = "agent_computer_folder.rs"]
mod folder;
pub(crate) use folder::capture as capture_folder;
use folder::FolderIdentity;

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
    // The directory objects the person chose. A grant saved before these existed has none and
    // fails validate_path until the folder is chosen again.
    #[serde(default)]
    pub path_identity: Option<FolderIdentity>,
    #[serde(default)]
    pub source_identity: Option<FolderIdentity>,
    #[serde(default)]
    pub can_write: bool,
    #[serde(default)]
    pub revoked: bool,
}

impl Grant {
    pub fn bind_identity(mut self) -> Result<Self, String> {
        self.validate_paths_only()?;
        self.path_identity = folder::capture(&self.path)?;
        self.source_identity = self
            .source_path
            .as_deref()
            .map(folder::capture)
            .transpose()?
            .flatten();
        Ok(self)
    }

    pub fn bind_selected_identity(self, selected: Option<FolderIdentity>) -> Result<Self, String> {
        let grant = self.bind_identity()?;
        let current = if grant.source_path.is_some() {
            &grant.source_identity
        } else {
            &grant.path_identity
        };
        if *current != selected {
            return Err("The selected folder changed. Choose it again on this computer.".into());
        }
        Ok(grant)
    }

    pub fn validate_path(&self) -> Result<(), String> {
        self.validate_paths_only()?;
        folder::verify(&self.path, self.path_identity.as_ref())?;
        if let Some(source) = &self.source_path {
            folder::verify(source, self.source_identity.as_ref())?;
        }
        Ok(())
    }

    fn validate_paths_only(&self) -> Result<(), String> {
        if self
            .path
            .canonicalize()
            .map_err(|_| "The granted folder is unavailable")?
            != self.path
        {
            return Err("The granted folder changed. Choose it again on this computer.".into());
        }
        if self.can_write && self.source_path.is_none() {
            return Err(
                "Choose this edit folder again to use the current computer safety rules.".into(),
            );
        }
        if let Some(source) = &self.source_path {
            if source
                .canonicalize()
                .map_err(|_| "The original folder is unavailable")?
                != *source
            {
                return Err(
                    "The original folder changed. Choose it again on this computer.".into(),
                );
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
        .ok_or("This worktree is no longer granted on this computer.")?;
    if !grant
        .source_path
        .as_ref()
        .is_some_and(|source| source != &grant.path)
    {
        return Err("This grant has no separate worktree.".into());
    }
    grant.validate_path()?;
    Ok(grant)
}

#[path = "agent_computer_store_write.rs"]
mod writer;

pub fn save(file: &Path, grants: &[Grant]) -> Result<(), String> {
    writer::save(file, grants)
}

#[cfg(test)]
#[path = "agent_computer_store_tests.rs"]
mod tests;
