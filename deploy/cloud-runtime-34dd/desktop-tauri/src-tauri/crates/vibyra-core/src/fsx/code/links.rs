//! Checks that never follow a link: search, replace and file operations look
//! at each folder above a path with `lstat`, so a folder swapped for a link
//! can never carry a read or a write out of the project.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use crate::{CoreError, CoreResult};

pub(super) struct LinkGuard {
    root: PathBuf,
    clean: HashSet<PathBuf>,
}

impl LinkGuard {
    /// `canon_root` must already be canonical.
    pub(super) fn new(canon_root: &Path) -> Self {
        Self {
            root: canon_root.to_path_buf(),
            clean: HashSet::new(),
        }
    }

    /// The full path of `rel` once every folder above it is known to be a real
    /// folder (not a link). The last part is not looked at, so a link can still
    /// be named, renamed or removed as itself.
    pub(super) fn path_of(&mut self, rel: &Path) -> CoreResult<PathBuf> {
        let parts: Vec<Component> = rel.components().collect();
        let mut at = self.root.clone();
        for (index, part) in parts.iter().enumerate() {
            let Component::Normal(name) = part else {
                return Err(CoreError::InvalidPath(
                    "Paths may not contain \"..\".".into(),
                ));
            };
            at.push(name);
            if index + 1 == parts.len() || self.clean.contains(&at) {
                continue;
            }
            match std::fs::symlink_metadata(&at) {
                Ok(meta) if meta.is_dir() => {
                    self.clean.insert(at.clone());
                }
                Ok(meta) if meta.file_type().is_symlink() => {
                    return Err(CoreError::InvalidPath(
                        "A folder on this path is a link. Links are never followed.".into(),
                    ))
                }
                Ok(_) => {
                    return Err(CoreError::InvalidPath(
                        "A folder on this path is a file.".into(),
                    ))
                }
                Err(_) => {
                    return Err(CoreError::InvalidPath(
                        "The folder no longer exists.".into(),
                    ))
                }
            }
        }
        Ok(at)
    }
}

/// Opens a file for reading, refusing a link in the last place too (the
/// folders above were checked by `LinkGuard`).
pub(super) fn open_no_follow(path: &Path) -> std::io::Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    options.open(path)
}

#[cfg(test)]
#[path = "links_tests.rs"]
mod tests;
