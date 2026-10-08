use super::*;

fn project() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    (temp, root)
}

fn put(root: &Path, rel: &str, text: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

/// A stand-in Trash: moves the item into a folder outside the project.
fn fake_trash(bin: &Path) -> impl Fn(&Path) -> CoreResult<()> + '_ {
    move |path| {
        let name = path.file_name().unwrap();
        std::fs::rename(path, bin.join(name))?;
        Ok(())
    }
}

#[test]
fn creates_files_and_folders_with_missing_parents() {
    let (_temp, root) = project();
    let file = create_entry(&root, "src/new/file.ts", EntryKind::File).unwrap();
    assert_eq!(file.rel_path, "src/new/file.ts");
    assert_eq!(std::fs::read(root.join("src/new/file.ts")).unwrap(), b"");
    let dir = create_entry(&root, "docs", EntryKind::Dir).unwrap();
    assert!(Path::new(&dir.path).is_dir());
    let absolute = root.join("abs.txt");
    create_entry(&root, absolute.to_str().unwrap(), EntryKind::File).unwrap();
    assert!(absolute.is_file());
}

#[test]
fn nothing_existing_is_overwritten() {
    let (_temp, root) = project();
    put(&root, "a.txt", "keep");
    assert!(create_entry(&root, "a.txt", EntryKind::File).is_err());
    assert!(create_entry(&root, "a.txt/b.txt", EntryKind::File).is_err());
    assert_eq!(std::fs::read_to_string(root.join("a.txt")).unwrap(), "keep");
    put(&root, "from.txt", "x");
    put(&root, "to.txt", "y");
    assert!(move_entry(&root, "from.txt", "to.txt").is_err());
    assert_eq!(std::fs::read_to_string(root.join("to.txt")).unwrap(), "y");
}

#[test]
fn bad_names_and_traversal_are_refused() {
    let (_temp, root) = project();
    let outside = root.parent().unwrap().join("escaped.txt");
    for path in [
        "../escaped.txt",
        "a/../../escaped.txt",
        "",
        "a\\b",
        "bad|name",
        ".git/config",
        "x/.GIT/y",
        "/etc/passwd",
    ] {
        assert!(
            create_entry(&root, path, EntryKind::File).is_err(),
            "{path:?}"
        );
    }
    assert!(!outside.exists());
    assert!(create_entry(&root, &"a/".repeat(40), EntryKind::Dir).is_err());
    assert!(create_entry(&root, &"n".repeat(300), EntryKind::File).is_err());
}

#[test]
fn rename_and_move_keep_the_contents() {
    let (_temp, root) = project();
    put(&root, "src/a.txt", "one");
    put(&root, "dir/inner/b.txt", "two");
    std::fs::create_dir_all(root.join("dest")).unwrap();
    let renamed = move_entry(&root, "src/a.txt", "src/renamed.txt").unwrap();
    assert_eq!(renamed.rel_path, "src/renamed.txt");
    move_entry(&root, "src/renamed.txt", "dest/moved.txt").unwrap();
    move_entry(&root, "dir", "dest/dir").unwrap();
    assert_eq!(
        std::fs::read_to_string(root.join("dest/moved.txt")).unwrap(),
        "one"
    );
    assert_eq!(
        std::fs::read_to_string(root.join("dest/dir/inner/b.txt")).unwrap(),
        "two"
    );
    assert!(!root.join("src/a.txt").exists() && !root.join("dir").exists());
}

#[test]
fn a_move_cannot_escape_land_in_git_or_enter_itself() {
    let (_temp, root) = project();
    put(&root, "a.txt", "x");
    put(&root, "folder/f.txt", "y");
    for to in [
        "../out.txt",
        ".git/a.txt",
        "folder/a/../../../x",
        "missing/a.txt",
    ] {
        assert!(move_entry(&root, "a.txt", to).is_err(), "{to}");
    }
    assert!(move_entry(&root, "folder", "folder/inside").is_err());
    assert!(move_entry(&root, "a.txt", "a.txt").is_err());
    assert!(move_entry(&root, "../a.txt", "b.txt").is_err());
    assert!(move_entry(&root, "nope.txt", "b.txt").is_err());
    assert!(root.join("a.txt").exists());
}

#[test]
fn delete_goes_to_the_trash_and_never_the_root_or_git() {
    let (_temp, root) = project();
    let (_bin_temp, bin) = project();
    put(&root, "src/a.txt", "x");
    put(&root, ".git/HEAD", "ref");
    let trash = fake_trash(&bin);
    let gone = delete_entry(&root, "src/a.txt", &trash).unwrap();
    assert_eq!(gone.rel_path, "src/a.txt");
    assert!(!root.join("src/a.txt").exists() && bin.join("a.txt").exists());
    for path in [
        "",
        ".",
        ".git",
        ".git/HEAD",
        "../x",
        root.to_str().unwrap(),
        "missing.txt",
    ] {
        assert!(delete_entry(&root, path, &trash).is_err(), "{path:?}");
    }
    assert!(root.join(".git/HEAD").exists() && root.exists());
}

#[test]
fn a_failed_trash_leaves_the_item_in_place() {
    let (_temp, root) = project();
    put(&root, "a.txt", "x");
    let broken = |_: &Path| -> CoreResult<()> { Err(refuse("no trash")) };
    assert!(delete_entry(&root, "a.txt", &broken).is_err());
    assert!(root.join("a.txt").exists());
}

#[cfg(unix)]
#[test]
fn links_are_not_followed() {
    let (_temp, root) = project();
    let (_other, outside) = project();
    let (_bin_temp, bin) = project();
    put(&outside, "secret/s.txt", "s");
    std::os::unix::fs::symlink(outside.join("secret"), root.join("link")).unwrap();
    put(&root, "a.txt", "x");
    let trash = fake_trash(&bin);
    assert!(create_entry(&root, "link/new.txt", EntryKind::File).is_err());
    assert!(move_entry(&root, "link/s.txt", "stolen.txt").is_err());
    assert!(move_entry(&root, "a.txt", "link/a.txt").is_err());
    assert!(delete_entry(&root, "link/s.txt", &trash).is_err());
    assert!(outside.join("secret/s.txt").exists() && !outside.join("secret/new.txt").exists());
    // The link itself is only ever moved or trashed as a link.
    move_entry(&root, "link", "renamed-link").unwrap();
    assert!(std::fs::symlink_metadata(root.join("renamed-link"))
        .unwrap()
        .file_type()
        .is_symlink());
    delete_entry(&root, "renamed-link", &trash).unwrap();
    assert!(outside.join("secret/s.txt").exists(), "the target survives");
}
