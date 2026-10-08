use super::*;

fn project() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    (temp, root)
}

fn names(root: &Path) -> Vec<String> {
    list_instructions(root)
        .into_iter()
        .map(|file| file.rel_path)
        .collect()
}

#[test]
fn lists_the_instruction_files_a_project_has() {
    let (_temp, root) = project();
    assert!(list_instructions(&root).is_empty());
    std::fs::write(root.join("CLAUDE.md"), "be kind").unwrap();
    std::fs::write(root.join("AGENTS.md"), "x").unwrap();
    std::fs::write(root.join("README.md"), "not one").unwrap();
    std::fs::create_dir_all(root.join(".cursor/rules/deep")).unwrap();
    std::fs::write(root.join(".cursor/rules/style.mdc"), "a").unwrap();
    std::fs::write(root.join(".cursor/rules/notes.txt"), "a").unwrap();
    std::fs::write(root.join(".cursor/rules/deep/api.md"), "a").unwrap();
    assert_eq!(
        names(&root),
        [
            "AGENTS.md",
            "CLAUDE.md",
            ".cursor/rules/deep/api.md",
            ".cursor/rules/style.mdc"
        ]
    );
    assert_eq!(list_instructions(&root)[1].size, 7);
}

#[test]
fn only_instruction_paths_qualify() {
    for yes in [
        "AGENTS.md",
        "agents.md",
        ".cursor/rules/a.mdc",
        ".CURSOR/Rules/x/y.md",
    ] {
        assert!(is_instruction_path(yes), "{yes}");
    }
    for no in [
        "README.md",
        "src/AGENTS.md",
        ".cursor/rules",
        ".cursor/rules/a.txt",
        ".cursor/mcp.json",
        ".cursor/rules/a/b/c.md",
    ] {
        assert!(!is_instruction_path(no), "{no}");
    }
}

#[cfg(unix)]
#[test]
fn links_are_listed_but_never_followed() {
    let (_temp, root) = project();
    std::fs::write(root.join("AGENTS.md"), "real").unwrap();
    std::os::unix::fs::symlink("AGENTS.md", root.join("CLAUDE.md")).unwrap();
    let files = list_instructions(&root);
    assert_eq!(files[1].link.as_deref(), Some("AGENTS.md"));
    assert_eq!(files[1].size, 0);
    // A linked rules folder is not entered.
    let outside = tempfile::tempdir().unwrap();
    std::fs::create_dir(outside.path().join("rules")).unwrap();
    std::fs::write(outside.path().join("rules/a.md"), "x").unwrap();
    std::os::unix::fs::symlink(outside.path(), root.join(".cursor")).unwrap();
    assert_eq!(names(&root), ["AGENTS.md", "CLAUDE.md"]);
}

#[cfg(unix)]
#[test]
fn a_write_to_a_link_is_refused_and_the_target_untouched() {
    let (_temp, root) = project();
    let outside = tempfile::tempdir().unwrap();
    let target = outside.path().join("secret.md");
    std::fs::write(&target, "keep").unwrap();
    std::os::unix::fs::symlink(&target, root.join("AGENTS.md")).unwrap();
    let error = prepare_write(&root, "AGENTS.md", "x")
        .unwrap_err()
        .to_string();
    assert!(error.contains("link"), "{error}");
    // A linked folder on the way is refused too, new file or not.
    std::fs::create_dir(outside.path().join("rules")).unwrap();
    std::os::unix::fs::symlink(outside.path(), root.join(".cursor")).unwrap();
    assert!(prepare_write(&root, ".cursor/rules/new.md", "x").is_err());
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "keep");
}

#[test]
fn traversal_and_outside_paths_are_refused() {
    let (_temp, root) = project();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("AGENTS.md"), "x").unwrap();
    for path in [
        "../AGENTS.md",
        ".cursor/rules/../../../AGENTS.md",
        "sub/../../AGENTS.md",
        outside.path().join("AGENTS.md").to_str().unwrap(),
        ".git/AGENTS.md",
        "",
    ] {
        assert!(prepare_write(&root, path, "x").is_err(), "{path}");
    }
}

#[test]
fn a_file_that_is_not_an_instruction_file_passes_through_unchanged() {
    let (_temp, root) = project();
    std::fs::write(root.join("a.txt"), "one\r\ntwo\r\n").unwrap();
    assert_eq!(prepare_write(&root, "a.txt", "x\ny\n").unwrap(), "x\ny\n");
}

#[test]
fn a_crlf_file_stays_crlf_and_a_new_one_is_lf() {
    let (_temp, root) = project();
    std::fs::write(root.join("AGENTS.md"), "one\r\ntwo\r\n").unwrap();
    assert_eq!(
        prepare_write(&root, "AGENTS.md", "a\nb\n").unwrap(),
        "a\r\nb\r\n"
    );
    assert_eq!(
        prepare_write(&root, "AGENTS.md", "a\r\nb").unwrap(),
        "a\r\nb"
    );
    std::fs::write(root.join("CLAUDE.md"), "one\ntwo\n").unwrap();
    assert_eq!(
        prepare_write(&root, "CLAUDE.md", "a\nb\n").unwrap(),
        "a\nb\n"
    );
    assert_eq!(
        prepare_write(&root, "GEMINI.md", "a\r\nb\n").unwrap(),
        "a\nb\n"
    );
}

#[test]
fn the_size_cap_is_enforced_for_instruction_files_only() {
    let (_temp, root) = project();
    let big = "x".repeat(INSTRUCTION_LIMIT_BYTES as usize + 1);
    assert!(prepare_write(&root, "AGENTS.md", &big).is_err());
    assert!(prepare_write(&root, "notes.txt", &big).is_ok());
}

#[test]
fn a_saved_instruction_file_is_hash_guarded_and_atomic() {
    let (_temp, root) = project();
    std::fs::create_dir_all(root.join(".cursor/rules")).unwrap();
    let created = super::super::write_file(
        &root,
        "AGENTS.md",
        &prepare_write(&root, "AGENTS.md", "hello\n").unwrap(),
        None,
    )
    .unwrap();
    // A second create must not overwrite the first.
    assert!(super::super::write_file(&root, "AGENTS.md", "other", None).is_err());
    std::fs::write(root.join("AGENTS.md"), "changed elsewhere\r\n").unwrap();
    let stale = super::super::write_file(&root, "AGENTS.md", "mine", Some(&created.hash));
    assert!(stale.is_err());
    let temps = std::fs::read_dir(&root)
        .unwrap()
        .flatten()
        .filter(|item| item.file_name().to_string_lossy().ends_with(".tmp"))
        .count();
    assert_eq!(temps, 0);
}
