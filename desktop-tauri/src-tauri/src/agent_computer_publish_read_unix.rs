//! Unix worktree reads retain directory identity and no-follow component checks.
use super::{Grant, MAX_FILE_BYTES};
use std::path::Path;

pub(crate) fn read_file(
    grant: &Grant,
    path: &Path,
) -> Result<(Vec<u8>, &'static str), std::io::Error> {
    use std::ffi::CString;
    use std::io::Read;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    // Held directory handle, compared with the granted folder's identity, then `openat` with
    // O_NOFOLLOW per component: a swapped folder or a symlink cannot redirect the read.
    let mut dir = std::fs::File::open(&grant.path)?;
    let root = dir.metadata()?;
    let id = grant
        .path_identity
        .as_ref()
        .ok_or(std::io::ErrorKind::PermissionDenied)?;
    if root.dev() != id.device || root.ino() != id.inode {
        return Err(std::io::ErrorKind::PermissionDenied.into());
    }
    let parts: Vec<_> = path.components().collect();
    for (index, component) in parts.iter().enumerate() {
        if !matches!(component, std::path::Component::Normal(_)) {
            return Err(std::io::ErrorKind::InvalidInput.into());
        }
        let name = CString::new(component.as_os_str().as_bytes())
            .map_err(|_| std::io::ErrorKind::InvalidInput)?;
        let last = index + 1 == parts.len();
        let flags = libc::O_RDONLY
            | libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | if last { 0 } else { libc::O_DIRECTORY };
        let fd = unsafe { libc::openat(dir.as_raw_fd(), name.as_ptr(), flags) };
        if fd < 0 {
            return Err(std::io::Error::last_os_error());
        }
        dir = unsafe { std::fs::File::from_raw_fd(fd) };
    }
    let meta = dir.metadata()?;
    if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
        return Err(std::io::ErrorKind::InvalidData.into());
    }
    let mode = if meta.permissions().mode() & 0o111 != 0 {
        "100755"
    } else {
        "100644"
    };
    let mut bytes = Vec::new();
    dir.take(MAX_FILE_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 != meta.len() || bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(std::io::ErrorKind::InvalidData.into());
    }
    Ok((bytes, mode))
}
