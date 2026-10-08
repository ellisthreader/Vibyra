//! A computer grant names one directory object, not merely a reusable path string.
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderIdentity {
    pub device: u64,
    pub inode: u64,
}

pub fn capture(path: &Path) -> Result<Option<FolderIdentity>, String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| "The granted folder is unavailable".to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("The granted folder changed. Choose it again on this computer.".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(Some(FolderIdentity {
            device: metadata.dev(),
            inode: metadata.ino(),
        }))
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Choose a folder without a Windows reparse point.".into());
        }
        let (device, inode) = vibyra_engine::windows_directory_identity(path)?;
        Ok(Some(FolderIdentity { device, inode }))
    }
    #[cfg(not(any(unix, windows)))]
    {
        Err("This computer cannot verify a folder grant.".into())
    }
}

pub fn verify(path: &Path, expected: Option<&FolderIdentity>) -> Result<(), String> {
    let current = capture(path)?;
    if current.as_ref() != expected {
        return Err("The granted folder was replaced. Choose it again on this computer.".into());
    }
    Ok(())
}
