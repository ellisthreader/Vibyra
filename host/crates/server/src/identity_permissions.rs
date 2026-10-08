//! The file fallback is explicit and private to the OS user. Desktop normally
//! uses its credential-store adapter and persists only public identity data.
use std::{fs, path::Path};

fn not_symlink(path: &Path) -> Result<(), String> {
    if fs::symlink_metadata(path)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Host identity storage cannot be a symbolic link".into());
    }
    Ok(())
}
pub(crate) fn directory(path: &Path) -> Result<(), String> {
    not_symlink(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    windows::protect(path, true)?;
    Ok(())
}
pub(crate) fn existing_file(path: &Path) -> Result<(), String> {
    not_symlink(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(path)
            .map_err(|e| e.to_string())?
            .permissions()
            .mode()
            & 0o077
            != 0
        {
            return Err("Host identity permissions must be 0600".into());
        }
    }
    #[cfg(windows)]
    windows::protect(path, false)?;
    Ok(())
}
pub(crate) fn new_file(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    windows::protect(path, false)?;
    Ok(())
}

#[cfg(windows)]
mod windows {
    use std::{os::windows::ffi::OsStrExt, path::Path, ptr};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::{
            Authorization::{
                ConvertStringSecurityDescriptorToSecurityDescriptorW, SetNamedSecurityInfoW,
                SDDL_REVISION_1, SE_FILE_OBJECT,
            },
            GetSecurityDescriptorDacl, DACL_SECURITY_INFORMATION,
            PROTECTED_DACL_SECURITY_INFORMATION,
        },
    };
    pub(super) fn protect(path: &Path, directory: bool) -> Result<(), String> {
        // Replace the DACL atomically. OW is the documented Owner Rights SID;
        // inherited grants cannot allow other users to read this private key.
        let sddl = if directory {
            "D:P(A;OICI;FA;;;OW)"
        } else {
            "D:P(A;;FA;;;OW)"
        };
        let sddl: Vec<u16> = sddl.encode_utf16().chain(Some(0)).collect();
        let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut descriptor = ptr::null_mut();
        let mut dacl = ptr::null_mut();
        let (mut present, mut defaulted) = (0, 0);
        // All pointers reference live buffers; Windows owns the converted
        // descriptor until LocalFree, after SetNamedSecurityInfo copies it.
        unsafe {
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                SDDL_REVISION_1,
                &mut descriptor,
                ptr::null_mut(),
            ) == 0
            {
                return Err("Cannot create private Host identity permissions".into());
            }
            let result =
                if GetSecurityDescriptorDacl(descriptor, &mut present, &mut dacl, &mut defaulted)
                    == 0
                    || present == 0
                    || dacl.is_null()
                {
                    1
                } else {
                    SetNamedSecurityInfoW(
                        path.as_ptr(),
                        SE_FILE_OBJECT,
                        DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                        ptr::null_mut(),
                        ptr::null_mut(),
                        dacl,
                        ptr::null_mut(),
                    )
                };
            LocalFree(descriptor);
            if result != 0 {
                return Err("Cannot secure Host identity storage for this Windows user".into());
            }
        }
        Ok(())
    }
}
