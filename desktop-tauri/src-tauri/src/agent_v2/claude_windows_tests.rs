//! Native Windows discovery and PATH contracts; never accepts a batch shim.
use super::*;

#[test]
fn windows_discovery_uses_only_the_absolute_native_executable() {
    let dir = tempfile::Builder::new()
        .prefix("provider space;semi-")
        .tempdir()
        .unwrap();
    let path = std::env::join_paths([dir.path()]).unwrap();
    for shim in ["claude", "claude.cmd", "claude.bat"] {
        std::fs::write(dir.path().join(shim), "not a native executable").unwrap();
    }
    assert_eq!(find_in_path("claude", &path), None);
    let native = dir.path().join("claude.exe");
    std::fs::write(&native, "native fixture path").unwrap();
    let expected = std::fs::canonicalize(native).unwrap();
    assert!(expected.is_absolute());
    assert_eq!(find_in_path("claude", &path), Some(expected.clone()));
    assert_eq!(find_in_path("claude.exe", &path), Some(expected));
    for shim in ["claude.cmd", "claude.bat", "claude.ps1"] {
        assert_eq!(find_in_path(shim, &path), None);
    }
}

#[test]
fn windows_discovery_rejects_relative_search_dirs_and_provider_paths() {
    let dir = tempfile::tempdir_in(std::env::current_dir().unwrap()).unwrap();
    std::fs::write(dir.path().join("claude.exe"), "native fixture path").unwrap();
    let path = std::env::join_paths([dir.path()]).unwrap();
    for name in [
        r"folder\claude.exe",
        "folder/claude.exe",
        r"C:\claude.exe",
        "C:claude.exe",
    ] {
        assert_eq!(find_in_path(name, &path), None);
    }
    let relative = dir.path().file_name().unwrap();
    let relative_path = std::env::join_paths([Path::new(relative), Path::new("")]).unwrap();
    assert_eq!(find_in_path("claude", &relative_path), None);
}

#[test]
fn windows_native_path_preserves_a_provider_directory_with_a_semicolon() {
    let program = PathBuf::from(r"C:\provider;custom\claude.exe");
    let path = platform::path(&program);
    let paths: Vec<_> = std::env::split_paths(&path).collect();
    assert_eq!(paths.last().unwrap(), program.parent().unwrap());
    assert_eq!(paths.len(), 3);
}
