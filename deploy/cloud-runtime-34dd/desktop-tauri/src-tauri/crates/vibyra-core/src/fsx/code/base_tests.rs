use super::*;
use crate::fsx::code::test_git::{commit_all, repo, run, text, write};

#[test]
fn base_is_the_committed_text_of_modified_new_deleted_and_renamed_files() {
    let (_temp, root) = repo();
    write(&root, "app/a.txt", "committed\n");
    write(&root, "app/old.txt", "old name\n");
    write(&root, "app/gone.txt", "deleted\n");
    let head = commit_all(&root, "first");
    write(&root, "app/a.txt", "edited\n");
    write(&root, "app/new.txt", "brand new\n");
    std::fs::remove_file(root.join("app/gone.txt")).unwrap();
    run(&root, &["mv", "app/old.txt", "app/renamed.txt"]);

    let modified = base(&root, "app/a.txt", None).unwrap();
    assert_eq!(modified.text.as_deref(), Some("committed\n"));
    assert_eq!(modified.commit.as_deref(), Some(head.as_str()));
    let new = base(&root, "app/new.txt", None).unwrap();
    assert_eq!(new.text, None);
    assert_eq!(new.commit.as_deref(), Some(head.as_str()));
    let deleted = base(&root, "app/gone.txt", None).unwrap();
    assert_eq!(deleted.text.as_deref(), Some("deleted\n"));
    let renamed = base(&root, "app/renamed.txt", Some("app/old.txt")).unwrap();
    assert_eq!(renamed.text.as_deref(), Some("old name\n"));
    assert!(base(&root, "../x", None).is_err());
    assert!(base(&root, ".git/HEAD", None).is_err());
}

#[test]
fn base_paths_are_relative_to_a_subfolder_root() {
    let (_temp, root) = repo();
    write(&root, "app/src/lib.rs", "pub fn a() {}\n");
    write(&root, "app/bin.dat", "a\0b");
    commit_all(&root, "first");
    let sub = root.join("app");
    let found = base(&sub, "src/lib.rs", None).unwrap();
    assert_eq!(found.text.as_deref(), Some("pub fn a() {}\n"));
    let absolute = sub.join("src/lib.rs");
    let found = base(&sub, text(&absolute), None).unwrap();
    assert_eq!(found.text.as_deref(), Some("pub fn a() {}\n"));
    assert_eq!(base(&sub, "bin.dat", None).unwrap().text, None, "binary");
}

#[test]
fn an_unborn_repository_has_no_base() {
    let (_temp, root) = repo();
    write(&root, "a.txt", "a");
    let found = base(&root, "a.txt", None).unwrap();
    assert_eq!(found.commit, None);
    assert_eq!(found.text, None);
}

#[test]
fn versions_compare_worktrees_against_their_common_ancestor() {
    let (temp, root) = repo();
    write(&root, "app/f.txt", "base\n");
    let ancestor = commit_all(&root, "base");
    let other = temp.path().canonicalize().unwrap().join("other");
    run(
        &root,
        &["worktree", "add", "-q", "-b", "agent", text(&other)],
    );
    write(&other, "app/f.txt", "agent\n");
    commit_all(&other, "agent work");
    write(&root, "app/f.txt", "main\n");
    commit_all(&root, "main work");
    write(&root, "app/f.txt", "main dirty\n");

    let roots = vec![
        text(&root.join("app")).to_string(),
        text(&other.join("app")).to_string(),
    ];
    let found = versions(&roots, "f.txt").unwrap();
    assert_eq!(found.base.commit.as_deref(), Some(ancestor.as_str()));
    assert_eq!(found.base.text.as_deref(), Some("base\n"));
    assert_eq!(found.versions.len(), 2);
    assert_eq!(found.versions[0].root, roots[0]);
    assert_eq!(found.versions[0].text.as_deref(), Some("main dirty\n"));
    assert_eq!(found.versions[1].text.as_deref(), Some("agent\n"));
    assert_eq!(
        found.versions[1].hash.as_deref(),
        Some(sha256_hex(b"agent\n").as_str())
    );

    std::fs::remove_file(other.join("app/f.txt")).unwrap();
    let found = versions(&roots, "f.txt").unwrap();
    assert_eq!(found.versions[1].text, None);
    assert_eq!(found.versions[1].hash, None);
}

#[test]
fn versions_limit_the_number_of_roots_and_check_paths() {
    let (_temp, root) = repo();
    let one = text(&root).to_string();
    assert!(versions(&[], "a").is_err());
    assert!(versions(&vec![one.clone(); 7], "a").is_err());
    assert!(versions(std::slice::from_ref(&one), "../a").is_err());
    let lone = versions(&[one], "missing.txt").unwrap();
    assert_eq!(lone.base.commit, None);
    assert_eq!(lone.versions[0].text, None);
}
