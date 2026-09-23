use super::*;
#[test]
fn nul_status_preserves_spaces_newlines_and_rename_pairs() {
    let files = parse_status(" M a b.txt\0R  new.txt\0old.txt\0?? line\nfile.txt\0 D gone\0");
    assert_eq!(files.len(), 4);
    assert_eq!(files[0].path, "a b.txt");
    assert_eq!(files[1].previous_path.as_deref(), Some("old.txt"));
    assert_eq!(files[2].path, "line\nfile.txt");
    assert_eq!(files[3].status, " D");
}
#[test]
fn reads_staged_unstaged_untracked_and_subfolder_scope() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    git(root, &["init", "-q"], 1000).unwrap();
    std::fs::create_dir(root.join("app")).unwrap();
    std::fs::write(root.join("app/file.txt"), "first\n").unwrap();
    git(root, &["add", "."], 1000).unwrap();
    std::fs::write(root.join("app/file.txt"), "second\n").unwrap();
    std::fs::write(root.join("outside.txt"), "outside").unwrap();
    std::fs::write(root.join("app/new.txt"), "new content").unwrap();
    let sub = root.join("app");
    let sub = sub.to_str().unwrap();
    let list = changes(sub).unwrap();
    assert_eq!(list.files.len(), 2);
    let diff = change_preview(sub, "app/file.txt").unwrap();
    assert!(diff.contains("Staged changes"));
    assert!(diff.contains("Working changes"));
    assert!(diff.contains("+second"));
    assert!(change_preview(sub, "outside.txt").is_err());
    assert!(change_preview(sub, "app/new.txt")
        .unwrap()
        .contains("new content"));
}

#[test]
fn rename_and_deleted_files_keep_reviewable_diffs() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let folder = root.to_str().unwrap();
    git(root, &["init", "-q"], 1000).unwrap();
    std::fs::write(root.join("old name.txt"), "original\n").unwrap();
    std::fs::write(root.join("deleted.txt"), "gone\n").unwrap();
    git(root, &["add", "."], 1000).unwrap();
    git(
        root,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-qm",
            "fixture",
        ],
        1000,
    )
    .unwrap();
    git(root, &["mv", "old name.txt", "new name.txt"], 1000).unwrap();
    std::fs::remove_file(root.join("deleted.txt")).unwrap();
    let list = changes(folder).unwrap();
    assert_eq!(list.files.len(), 2);
    assert!(change_preview(folder, "new name.txt")
        .unwrap()
        .contains("rename to new name.txt"));
    assert!(change_preview(folder, "deleted.txt")
        .unwrap()
        .contains("-gone"));
}

#[test]
fn status_and_diff_do_not_run_a_repository_clean_filter() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("repo");
    std::fs::create_dir(&root).unwrap();
    git(&root, &["init", "-q"], 1000).unwrap();
    std::fs::write(root.join(".gitattributes"), "*.txt filter=probe\n").unwrap();
    std::fs::write(root.join("file.txt"), "before\n").unwrap();
    git(&root, &["add", "."], 1000).unwrap();
    git(
        &root,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "commit",
            "-qm",
            "start",
        ],
        1000,
    )
    .unwrap();
    let outside = temp.path().join("outside-marker");
    let command = format!("sh -c 'touch \"{}\"; cat'", outside.display());
    git(&root, &["config", "filter.probe.clean", &command], 1000).unwrap();
    git(&root, &["config", "filter.probe.process", &command], 1000).unwrap();
    std::fs::write(root.join("file.txt"), "after\n").unwrap();
    let folder = root.to_str().unwrap();
    assert_eq!(safe_changes(folder).unwrap().files.len(), 1);
    assert!(safe_change_preview(folder, "file.txt")
        .unwrap()
        .contains("+after"));
    assert!(
        !outside.exists(),
        "A Git filter escaped the read-only tool boundary"
    );
}

#[test]
fn ordinary_desktop_diff_retains_filter_semantics() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("repo");
    std::fs::create_dir(&root).unwrap();
    git(&root, &["init", "-q"], 1000).unwrap();
    std::fs::write(root.join(".gitattributes"), "*.txt filter=probe\n").unwrap();
    git(
        &root,
        &["config", "filter.probe.clean", "sed 's/working.*/stored/'"],
        1000,
    )
    .unwrap();
    std::fs::write(root.join("file.txt"), "working\n").unwrap();
    git(&root, &["add", "."], 1000).unwrap();
    git(
        &root,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "commit",
            "-qm",
            "start",
        ],
        1000,
    )
    .unwrap();
    std::fs::write(root.join("file.txt"), "working!!!\n").unwrap();
    let folder = root.to_str().unwrap();
    assert_eq!(changes(folder).unwrap().files.len(), 1);
    assert!(change_preview(folder, "file.txt")
        .unwrap()
        .contains("No text diff"));
    assert_eq!(safe_changes(folder).unwrap().files.len(), 1);
    assert!(safe_change_preview(folder, "file.txt")
        .unwrap()
        .contains("+working!!!"));
}
