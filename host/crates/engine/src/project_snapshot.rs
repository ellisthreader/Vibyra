//! Bounded, exact-file VM input from the Agent Computer's held project handle.
use crate::Engine;
use cap_std::fs::MetadataExt as _;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    ffi::CString,
    fs::{File, Metadata},
    io::Read,
    os::{
        fd::{AsRawFd, FromRawFd, RawFd},
        unix::fs::MetadataExt as _,
    },
};

const MAX_FILES: usize = 128;
const MAX_FILE_BYTES: u64 = 256 * 1024;
const MAX_TOTAL_BYTES: usize = 8 * 1024 * 1024;

pub struct SnapshotFile {
    pub path: String,
    pub content: Vec<u8>,
    pub mode: u32,
    pub sha256: String,
}

pub struct ProjectSnapshot {
    pub files: Vec<SnapshotFile>,
    pub fingerprint: String,
}

fn components(path: &str) -> Result<Vec<&str>, String> {
    if path.is_empty() || path.len() > 2048 || path.contains(['\\', ':', '\0']) {
        return Err("snapshot requires a short relative project path".into());
    }
    let parts: Vec<_> = path.split('/').collect();
    if parts.iter().any(|part| {
        part.is_empty()
            || part.starts_with('.')
            || matches!(*part, "node_modules" | "vendor" | "__pycache__")
    }) {
        return Err("snapshot path is private or leaves the approved project".into());
    }
    Ok(parts)
}

fn open_at(parent: RawFd, name: &str, flags: i32) -> Result<File, String> {
    let name = CString::new(name).map_err(|_| "invalid snapshot path")?;
    // Each single component is opened relative to an already held directory.
    let fd = unsafe { libc::openat(parent, name.as_ptr(), flags, 0) };
    if fd < 0 {
        return Err(format!(
            "snapshot path is unavailable: {}",
            std::io::Error::last_os_error()
        ));
    }
    // openat returned an owned descriptor on success.
    Ok(unsafe { File::from_raw_fd(fd) })
}

fn same_file(before: &Metadata, after: &Metadata) -> bool {
    before.dev() == after.dev()
        && before.ino() == after.ino()
        && before.len() == after.len()
        && before.mode() == after.mode()
        && before.nlink() == after.nlink()
        && before.mtime() == after.mtime()
        && before.mtime_nsec() == after.mtime_nsec()
        && before.ctime() == after.ctime()
        && before.ctime_nsec() == after.ctime_nsec()
}

fn read_file(root: RawFd, device: u64, parts: &[&str]) -> Result<(Vec<u8>, u32), String> {
    let mut parent: Option<File> = None;
    for name in &parts[..parts.len() - 1] {
        let fd = parent.as_ref().map_or(root, AsRawFd::as_raw_fd);
        let next = open_at(
            fd,
            name,
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )?;
        if next.metadata().map_err(|e| e.to_string())?.dev() != device {
            return Err("snapshot cannot cross a mounted filesystem".into());
        }
        parent = Some(next);
    }
    let fd = parent.as_ref().map_or(root, AsRawFd::as_raw_fd);
    let mut file = open_at(
        fd,
        parts[parts.len() - 1],
        libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC,
    )?;
    let before = file.metadata().map_err(|e| e.to_string())?;
    if !before.is_file()
        || before.nlink() != 1
        || before.dev() != device
        || before.len() > MAX_FILE_BYTES
    {
        return Err("snapshot accepts only small, regular, singly linked project files".into());
    }
    let mut content = Vec::new();
    (&mut file)
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut content)
        .map_err(|e| e.to_string())?;
    let after = file.metadata().map_err(|e| e.to_string())?;
    if content.len() as u64 != before.len() || !same_file(&before, &after) {
        return Err("project file changed while the snapshot was copied".into());
    }
    let mode = if before.mode() & 0o111 != 0 {
        0o100755
    } else {
        0o100644
    };
    Ok((content, mode))
}

impl Engine {
    /// Local-only input builder. No remote Host method or Agent tool exposes it.
    /// The caller must first recheck the exact Mac grant and its worktree.
    pub fn snapshot_approved_files(
        &self,
        expected_identity: (u64, u64),
        paths: &[String],
    ) -> Result<ProjectSnapshot, String> {
        let project = {
            let state = self.shared.lock();
            let [project] = state.projects.as_slice() else {
                return Err("snapshot requires exactly one approved project".into());
            };
            if !project.read_only {
                return Err("snapshot requires a read-only Agent Computer project".into());
            }
            project.clone()
        };
        if paths.is_empty()
            || paths.len() > MAX_FILES
            || paths.iter().collect::<HashSet<_>>().len() != paths.len()
        {
            return Err("snapshot requires 1–128 distinct approved file paths".into());
        }
        let mut selected = paths
            .iter()
            .map(|path| components(path).map(|parts| (path, parts)))
            .collect::<Result<Vec<_>, _>>()?;
        selected.sort_by(|a, b| a.0.cmp(b.0));
        let root = project.directory.metadata(".").map_err(|e| e.to_string())?;
        if (root.dev(), root.ino()) != expected_identity {
            return Err("the opened project folder changed".into());
        }
        let current = std::fs::symlink_metadata(&project.path).map_err(|e| e.to_string())?;
        if (current.dev(), current.ino()) != expected_identity || !current.is_dir() {
            return Err("the granted project path changed".into());
        }
        let mut files = Vec::with_capacity(selected.len());
        let mut total = 0;
        for (path, parts) in selected {
            let (content, mode) = read_file(project.directory.as_raw_fd(), root.dev(), &parts)?;
            total += content.len();
            if total > MAX_TOTAL_BYTES {
                return Err("project snapshot exceeds the 8 MB limit".into());
            }
            let sha256 = format!("{:x}", Sha256::digest(&content));
            files.push(SnapshotFile {
                path: path.clone(),
                content,
                mode,
                sha256,
            });
        }
        let current = std::fs::symlink_metadata(&project.path).map_err(|e| e.to_string())?;
        if (current.dev(), current.ino()) != expected_identity || !current.is_dir() {
            return Err("the granted project path changed".into());
        }
        let manifest: Vec<_> = files
            .iter()
            .map(|file| {
                json!({
                    "path": file.path, "mode": file.mode, "sha256": file.sha256,
                })
            })
            .collect();
        let encoded = serde_json::to_vec(&manifest).map_err(|e| e.to_string())?;
        Ok(ProjectSnapshot {
            files,
            fingerprint: format!("{:x}", Sha256::digest(encoded)),
        })
    }
}
