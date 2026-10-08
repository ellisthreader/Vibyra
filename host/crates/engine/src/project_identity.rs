//! Identity of the directory handle already held by a Host project.
use crate::Engine;

impl Engine {
    /// Agent Computer creates exactly one project and must compare this open
    /// directory, rather than the path that was used to open it, to its grant.
    pub fn sole_project_directory_identity(&self) -> Result<Option<(u64, u64)>, String> {
        let state = self.shared.lock();
        let [project] = state.projects.as_slice() else {
            return Err("Agent Computer requires exactly one project directory.".into());
        };
        let metadata = project.directory.metadata(".").map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use cap_std::fs::MetadataExt;
            Ok(Some((metadata.dev(), metadata.ino())))
        }
        #[cfg(windows)]
        {
            let _ = metadata;
            Ok(Some(windows_handle_identity(&project.directory)?))
        }
        #[cfg(not(any(unix, windows)))]
        {
            let _ = metadata;
            Ok(None)
        }
    }
}

#[cfg(windows)]
pub fn windows_directory_identity(path: &std::path::Path) -> Result<(u64, u64), String> {
    let directory = cap_std::fs::Dir::open_ambient_dir(path, cap_std::ambient_authority())
        .map_err(|error| error.to_string())?;
    windows_handle_identity(&directory)
}

#[cfg(windows)]
fn windows_handle_identity(directory: &cap_std::fs::Dir) -> Result<(u64, u64), String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe { GetFileInformationByHandle(directory.as_raw_handle(), &mut info) } == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let file = (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow);
    if file == 0 {
        return Err("This Windows folder has no stable file identity".into());
    }
    Ok((u64::from(info.dwVolumeSerialNumber), file))
}

#[cfg(all(test, any(unix, windows)))]
mod tests {
    use super::*;

    #[test]
    fn opened_project_identity_survives_a_path_replacement() {
        let root = tempfile::tempdir().unwrap();
        let project = root.path().join("project");
        std::fs::create_dir(&project).unwrap();
        let project = project.canonicalize().unwrap();
        let engine =
            Engine::new_read_only(root.path().join("state"), "Project".into(), project.clone())
                .unwrap();
        let original = engine.sole_project_directory_identity().unwrap();
        let moved = std::fs::rename(&project, root.path().join("old-project"));
        #[cfg(windows)]
        if moved
            .as_ref()
            .is_err_and(|error| error.kind() == std::io::ErrorKind::PermissionDenied)
        {
            assert_eq!(engine.sole_project_directory_identity().unwrap(), original);
            return;
        }
        moved.unwrap();
        std::fs::create_dir(&project).unwrap();
        assert_eq!(engine.sole_project_directory_identity().unwrap(), original);
        let current = std::fs::metadata(&project).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            assert_ne!(original, Some((current.dev(), current.ino())));
        }
        #[cfg(windows)]
        {
            let _ = current;
            assert_ne!(
                original,
                Some(windows_directory_identity(&project).unwrap())
            );
        }
    }
}
