//! Windows half of `publish_snapshot::read_file`: one changed file, read only
//! from inside the exact granted worktree. `cap-std` opens every component
//! relative to the granted directory handle, so no junction, symlink or `..`
//! can lead out of it; the handle itself must be the folder that was granted.
use super::{Grant, MAX_FILE_BYTES};
use cap_std::fs::Dir;
use std::io::{Error, ErrorKind, Read};
use std::path::Path;

pub(crate) fn read_file(grant: &Grant, path: &Path) -> Result<(Vec<u8>, &'static str), Error> {
    let root = Dir::open_ambient_dir(&grant.path, cap_std::ambient_authority())?;
    let wanted = grant
        .path_identity
        .as_ref()
        .ok_or(ErrorKind::PermissionDenied)?;
    if identity(&root)? != (wanted.device, wanted.inode) {
        return Err(ErrorKind::PermissionDenied.into());
    }
    // A link inside the worktree is published as Git sees it, never followed.
    let link = root.symlink_metadata(path)?;
    if link.file_type().is_symlink() || !link.is_file() {
        return Err(ErrorKind::InvalidData.into());
    }
    let file = root.open(path)?;
    let meta = file.metadata()?;
    if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
        return Err(ErrorKind::InvalidData.into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_FILE_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 != meta.len() || bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(ErrorKind::InvalidData.into());
    }
    Ok((bytes, mode(grant, path)))
}

/// Windows has no executable bit: a file keeps the mode Git already records
/// for it (a tracked script stays 100755); a new file is 100644.
fn mode(grant: &Grant, path: &Path) -> &'static str {
    let Some(name) = path.to_str() else {
        return "100644";
    };
    let listed = super::git_ref::value(&grant.path, &["ls-files", "-s", "--", name]);
    match listed.as_deref().map(|line| line.split_whitespace().next()) {
        Ok(Some("100755")) => "100755",
        _ => "100644",
    }
}

/// Volume serial and file index of the opened directory handle itself.
fn identity(dir: &Dir) -> Result<(u64, u64), Error> {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    // SAFETY: a live handle owned by `dir`, and a correctly sized out-struct.
    unsafe { GetFileInformationByHandle(HANDLE(dir.as_raw_handle() as _), &mut info) }
        .map_err(|error| Error::other(error.to_string()))?;
    let file = (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow);
    Ok((u64::from(info.dwVolumeSerialNumber), file))
}
