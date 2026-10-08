use super::*;

fn project() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap().join("project");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::create_dir_all(root.join(".git")).unwrap();
    std::fs::write(root.join("src/main.rs"), "fn main() {}").unwrap();
    std::fs::write(root.join(".git/config"), "[core]").unwrap();
    std::fs::write(temp.path().join("secret.txt"), "secret").unwrap();
    (temp, root)
}

#[test]
fn resolves_relative_and_absolute_paths_inside_the_root() {
    let (_temp, root) = project();
    let expected = root.join("src/main.rs");
    assert_eq!(
        resolve_in_root(&root, "src/main.rs", false).unwrap(),
        expected
    );
    assert_eq!(
        resolve_in_root(&root, "./src/main.rs", false).unwrap(),
        expected
    );
    let absolute = expected.to_str().unwrap();
    assert_eq!(resolve_in_root(&root, absolute, false).unwrap(), expected);
}

#[test]
fn refuses_parent_segments_git_folders_and_empty_paths() {
    let (_temp, root) = project();
    for path in [
        "../secret.txt",
        "src/../../secret.txt",
        ".git/config",
        ".GIT/config",
        "src/.git/x",
        "",
        "a\0b",
    ] {
        assert!(resolve_in_root(&root, path, false).is_err(), "{path:?}");
        assert!(resolve_in_root(&root, path, true).is_err(), "{path:?}");
    }
}

#[test]
fn refuses_absolute_paths_outside_the_root() {
    let (temp, root) = project();
    let outside = temp.path().canonicalize().unwrap().join("secret.txt");
    assert!(resolve_in_root(&root, outside.to_str().unwrap(), false).is_err());
    assert!(resolve_in_root(&root, "/etc/hosts", false).is_err());
    assert!(resolve_in_root(&root, outside.to_str().unwrap(), true).is_err());
}

#[cfg(unix)]
#[test]
fn refuses_symlinks_that_leave_the_root_or_enter_git() {
    let (temp, root) = project();
    let secret = temp.path().join("secret.txt");
    std::os::unix::fs::symlink(&secret, root.join("escape.txt")).unwrap();
    std::os::unix::fs::symlink(temp.path(), root.join("up")).unwrap();
    std::os::unix::fs::symlink(root.join(".git/config"), root.join("cfg")).unwrap();
    std::os::unix::fs::symlink(root.join("src/main.rs"), root.join("ok.rs")).unwrap();
    assert!(resolve_in_root(&root, "escape.txt", false).is_err());
    assert!(resolve_in_root(&root, "escape.txt", true).is_err());
    assert!(resolve_in_root(&root, "up/secret.txt", false).is_err());
    assert!(resolve_in_root(&root, "up/new.txt", true).is_err());
    assert!(resolve_in_root(&root, "cfg", false).is_err());
    let inside = resolve_in_root(&root, "ok.rs", false).unwrap();
    assert_eq!(inside, root.join("src/main.rs"));
}

#[test]
fn writes_may_name_new_files_only_in_existing_folders() {
    let (_temp, root) = project();
    assert_eq!(
        resolve_in_root(&root, "src/new.rs", true).unwrap(),
        root.join("src/new.rs")
    );
    assert!(resolve_in_root(&root, "src/new.rs", false).is_err());
    assert!(resolve_in_root(&root, "missing/new.rs", true).is_err());
    assert!(resolve_in_root(&root, "src", true).is_err(), "a folder");
}

#[test]
fn split_is_lexical_and_joins_with_slashes() {
    let (_temp, root) = project();
    let (canon, rel) = split(&root, "src/gone.rs").unwrap();
    assert_eq!(canon, root);
    assert_eq!(slash_path(&rel), "src/gone.rs");
}
