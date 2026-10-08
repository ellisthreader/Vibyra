use super::*;
use crate::fsx::code::test_git::{commit_all, repo, write};
use std::collections::HashSet;

/// Every entry's path, rebuilt from the parent column.
fn paths(index: &CodeIndex) -> HashSet<String> {
    let mut full: Vec<String> = Vec::with_capacity(index.names.len());
    for (at, name) in index.names.iter().enumerate() {
        let parent = index.parents[at];
        assert!(parent < at as i32, "parent after child at {at}");
        let path = match parent {
            -1 => String::new(),
            0 => name.clone(),
            p => format!("{}/{name}", full[p as usize]),
        };
        full.push(path);
    }
    full.into_iter().skip(1).collect()
}

fn set(items: &[&str]) -> HashSet<String> {
    items.iter().map(|item| item.to_string()).collect()
}

#[test]
fn a_git_repository_lists_tracked_and_untracked_files_but_not_ignored_ones() {
    let (_temp, root) = repo();
    write(&root, ".gitignore", "ignored/\n*.log\n");
    write(&root, "src/lib.rs", "pub fn a() {}");
    write(&root, "src/deep/mod.rs", "x");
    commit_all(&root, "first");
    write(&root, "notes.md", "untracked");
    write(&root, "ignored/big.bin", "x");
    write(&root, "debug.log", "x");
    write(&root, "node_modules/pkg/index.js", "tracked? no, untracked");
    let never = AtomicBool::new(false);
    let index = build_index(&root, &never).unwrap();
    assert_eq!(index.names[0], "repo");
    assert_eq!(index.parents[0], -1);
    assert_eq!(index.root, root.to_str().unwrap());
    assert!(!index.truncated);
    let expected = set(&[
        ".gitignore",
        "src",
        "src/lib.rs",
        "src/deep",
        "src/deep/mod.rs",
        "notes.md",
        "node_modules",
        "node_modules/pkg",
        "node_modules/pkg/index.js",
    ]);
    assert_eq!(paths(&index), expected);
    let lib = index.names.iter().position(|n| n == "lib.rs").unwrap();
    assert_eq!((index.kinds[lib], index.sizes[lib]), (0, 13));
    let src = index.names.iter().position(|n| n == "src").unwrap();
    assert_eq!(index.kinds[src], 1);

    let sub = build_index(&root.join("src"), &never).unwrap();
    assert_eq!(paths(&sub), set(&["lib.rs", "deep", "deep/mod.rs"]));
}

#[test]
fn outside_git_the_walk_skips_build_output() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    write(&root, "src/main.ts", "x");
    write(&root, "node_modules/pkg/index.js", "x");
    write(&root, "Target/debug/app", "x");
    write(&root, "dist/out.js", "x");
    write(&root, ".env", "x");
    let index = build_index(&root, &AtomicBool::new(false)).unwrap();
    assert_eq!(paths(&index), set(&["src", "src/main.ts", ".env"]));
}

#[cfg(unix)]
#[test]
fn the_walk_never_follows_symlinks() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap().join("root");
    write(&root, "a.txt", "x");
    std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();
    let index = build_index(&root, &AtomicBool::new(false)).unwrap();
    assert_eq!(paths(&index), set(&["a.txt", "loop"]));
}

#[test]
fn a_full_index_is_marked_truncated() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    for n in 0..20 {
        write(&root, &format!("f{n}.txt"), "x");
    }
    let index = build_capped(&root, &AtomicBool::new(false), 5).unwrap();
    assert!(index.truncated);
    assert_eq!(index.names.len(), 5);

    let (_temp, repo_root) = repo();
    for n in 0..20 {
        write(&repo_root, &format!("d{n}/f.txt"), "x");
    }
    let index = build_capped(&repo_root, &AtomicBool::new(false), 7).unwrap();
    assert!(index.truncated);
    assert_eq!(index.names.len(), 7);
    paths(&index);
}

#[test]
fn a_cancelled_build_stops() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    for n in 0..(CANCEL_EVERY * 2) {
        write(&root, &format!("f{n}.txt"), "");
    }
    let error = build_index(&root, &AtomicBool::new(true)).unwrap_err();
    assert!(error.to_string().contains("Cancelled"));
    assert!(!super::super::cancel_index(&root), "nothing in flight");
    let cached = super::super::cached_index(&root).unwrap();
    assert_eq!(cached.names.len(), CANCEL_EVERY * 2 + 1);
    let again = super::super::cached_index(&root).unwrap();
    assert!(std::sync::Arc::ptr_eq(&cached, &again), "reused");
}
