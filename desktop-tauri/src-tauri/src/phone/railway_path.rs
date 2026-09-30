//! Locate a CLI directly in PATH, including Windows executable/shim suffixes.
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

pub(super) fn on_path(program: &str) -> Option<PathBuf> {
    on_path_in(cfg!(windows), program, &std::env::var_os("PATH")?)
}

pub(super) fn on_path_in(windows: bool, program: &str, paths: &OsStr) -> Option<PathBuf> {
    let mut names = vec![program.to_owned()];
    if windows && Path::new(program).extension().is_none() {
        names.extend(["exe", "cmd", "bat"].map(|extension| format!("{program}.{extension}")));
    }
    std::env::split_paths(paths)
        .filter(|dir| !dir.as_os_str().is_empty())
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .find(|path| {
            if windows {
                path.is_file()
            } else {
                is_executable(path)
            }
        })
}

#[cfg(unix)]
pub(super) fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
pub(super) fn is_executable(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_cli_shims_are_found_without_running_a_shell() {
        let directory = tempfile::tempdir().unwrap();
        let paths = std::env::join_paths([directory.path()]).unwrap();
        let shim = directory.path().join("railway.cmd");
        std::fs::write(&shim, "fixture").unwrap();
        assert_eq!(on_path_in(true, "railway", &paths), Some(shim));
        assert_eq!(on_path_in(true, "missing", &paths), None);
        let executable = directory.path().join("railway.exe");
        std::fs::write(&executable, "fixture").unwrap();
        assert_eq!(
            on_path_in(true, "railway", &paths),
            Some(executable.clone())
        );
        assert_eq!(on_path_in(true, "railway.exe", &paths), Some(executable));
    }
}
