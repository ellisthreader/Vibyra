//! OS context for the otherwise empty provider environment; never copies credentials or PATH.
use std::path::Path;

#[cfg(windows)]
fn root() -> std::path::PathBuf {
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::System::SystemInformation::GetWindowsDirectoryW;
    let mut buffer = [0u16; 32768];
    // SAFETY: the API writes only within the provided UTF-16 buffer.
    let length = unsafe { GetWindowsDirectoryW(Some(&mut buffer)) } as usize;
    assert!(
        length > 0 && length < buffer.len(),
        "Windows system directory is unavailable"
    );
    std::ffi::OsString::from_wide(&buffer[..length]).into()
}

pub(super) fn env(tmpdir: &Path) -> Vec<(String, String)> {
    #[cfg(windows)]
    {
        vec![
            ("SystemRoot".into(), root().to_string_lossy().into_owned()),
            ("TEMP".into(), tmpdir.to_string_lossy().into_owned()),
            ("TMP".into(), tmpdir.to_string_lossy().into_owned()),
        ]
    }
    #[cfg(not(windows))]
    {
        let _ = tmpdir;
        vec![]
    }
}

pub(super) fn path(program: &Path) -> String {
    #[cfg(windows)]
    {
        let root = root();
        let mut dirs = vec![root.join("System32"), root];
        if let Some(parent) = program.parent().filter(|dir| !dir.as_os_str().is_empty()) {
            // join_paths quotes semicolons, but rejects embedded double quotes.
            // An unrepresentable parent is omitted; the chosen executable still launches directly.
            if std::env::join_paths([parent]).is_ok() {
                dirs.push(parent.into());
            }
        }
        std::env::join_paths(dirs)
            .expect("Windows system paths")
            .to_string_lossy()
            .into_owned()
    }
    #[cfg(not(windows))]
    {
        let mut path = String::from("/usr/bin:/bin");
        if let Some(dir) = program.parent().filter(|dir| !dir.as_os_str().is_empty()) {
            path.push(':');
            path.push_str(&dir.to_string_lossy());
        }
        path
    }
}
