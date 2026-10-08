use super::*;

#[test]
fn a_linked_folder_above_a_path_is_refused() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.join("real/inner")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), root.join("linked")).unwrap();
    let mut guard = LinkGuard::new(&root);
    let ok = guard.path_of(Path::new("real/inner/a.txt")).unwrap();
    assert_eq!(ok, root.join("real/inner/a.txt"));
    assert!(guard.path_of(Path::new("real/missing/a.txt")).is_err());
    #[cfg(unix)]
    {
        assert!(guard.path_of(Path::new("linked/a.txt")).is_err());
        // The link itself can be named: it is moved or removed as a link.
        assert!(guard.path_of(Path::new("linked")).is_ok());
    }
    assert!(guard.path_of(Path::new("../a.txt")).is_err());
}

#[cfg(unix)]
#[test]
fn a_link_cannot_be_opened_as_a_file() {
    let temp = tempfile::tempdir().unwrap();
    let real = temp.path().join("real.txt");
    std::fs::write(&real, "x").unwrap();
    let link = temp.path().join("link.txt");
    std::os::unix::fs::symlink(&real, &link).unwrap();
    assert!(open_no_follow(&real).is_ok());
    assert!(open_no_follow(&link).is_err());
}
