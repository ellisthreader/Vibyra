//! `down-apply`: the CLI helper that writes the latest cloud snapshot into the folder when the Mac's copy of
//! every touched file is exactly the base. The app does NOT use this; it goes through the three-way review.
use super::{ApplyOutcome, Engine, ProjectRef};
use crate::cloud::{ChangeStatus, Side};
use crate::error::{io_at, Result, SyncError};
use crate::fsutil::write_atomic;
use crate::paths::project_key;
use std::path::{Path, PathBuf};

fn safe_target(root: &Path, rel: &str) -> Result<PathBuf> {
    let mut cur = root.to_path_buf();
    for part in rel.split('/') {
        // macOS folders ignore case, so `.GIT/hooks` is the real `.git`.
        if part.is_empty() || part == "." || part == ".." || part.eq_ignore_ascii_case(".git") {
            return Err(SyncError::Invalid(format!("unsafe path {rel}")));
        }
        cur.push(part);
        if std::fs::symlink_metadata(&cur).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(SyncError::Invalid(format!("{rel} goes through a symlink")));
        }
    }
    Ok(cur)
}

impl Engine {
    pub fn apply_cloud_if_clean(&self, project: &ProjectRef) -> Result<ApplyOutcome> {
        let key = project_key(&project.id);
        let Some(change) = self.store.load(&key).cloud.last().cloned() else {
            return Ok(ApplyOutcome::NothingToApply);
        };
        let mut conflicts = vec![];
        let mut plan = vec![];
        for f in &change.files {
            let target = safe_target(&project.root, &f.path)?;
            let disk = match std::fs::symlink_metadata(&target) {
                Ok(m) if m.is_file() => {
                    Some(std::fs::read(&target).map_err(|e| io_at("read", &target, e))?)
                }
                Ok(_) => {
                    conflicts.push(f.path.clone());
                    continue;
                }
                Err(_) => None,
            };
            let base = self.cloud_file(project, Side::Base, &f.path)?;
            let theirs = self.cloud_file(project, Side::Theirs, &f.path)?;
            if disk == theirs {
                continue; // already what the cloud has
            }
            if disk != base {
                conflicts.push(f.path.clone());
            } else {
                plan.push((f, target, theirs));
            }
        }
        if !conflicts.is_empty() {
            return Ok(ApplyOutcome::Conflicts { files: conflicts });
        }
        let mut files = vec![];
        for (f, target, theirs) in plan {
            match (f.status, theirs) {
                (ChangeStatus::Deleted, _) | (_, None) => {
                    let _ = std::fs::remove_file(&target);
                }
                (_, Some(bytes)) => {
                    write_atomic(&target, &bytes)?;
                    #[cfg(unix)]
                    if f.mode == "100755" {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = std::fs::set_permissions(
                            &target,
                            std::fs::Permissions::from_mode(0o755),
                        );
                    }
                }
            }
            files.push(f.path.clone());
        }
        self.dismiss_cloud_changes(project, change.seq)?;
        Ok(ApplyOutcome::Applied { files })
    }
}

#[cfg(test)]
mod tests {
    use super::safe_target;
    use std::path::Path;

    #[test]
    fn git_folder_is_refused_in_any_case() {
        let root = Path::new("/nonexistent-vibyra-root");
        for rel in [
            ".git/config",
            ".GIT/hooks/pre-commit",
            "src/.Git/config",
            "../x",
            "a//b",
        ] {
            assert!(safe_target(root, rel).is_err(), "{rel} must be refused");
        }
        assert!(safe_target(root, "src/main.rs").is_ok());
        assert!(safe_target(root, ".github/workflows/ci.yml").is_ok());
    }
}
