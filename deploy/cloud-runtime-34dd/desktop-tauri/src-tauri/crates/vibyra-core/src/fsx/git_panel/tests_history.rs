use super::tests_support::*;
use super::{blame, history};

#[test]
fn history_lists_parents_refs_and_pages() {
    let r = repo();
    r.git(&["switch", "-c", "feature"]);
    r.write("b.txt", "b\n");
    r.commit("feature work");
    r.git(&["switch", "main"]);
    r.write("c.txt", "c\n");
    r.commit("main work");
    r.git(&["merge", "--no-ff", "feature", "-m", "merge feature"]);
    let all = history(&r.root, 50, 0).unwrap();
    assert_eq!(all.commits.len(), 4);
    assert!(!all.more);
    let merge = &all.commits[0];
    assert_eq!(merge.subject, "merge feature");
    assert_eq!(
        merge.parents.len(),
        2,
        "a merge keeps both parents for the graph"
    );
    assert!(merge.refs.iter().any(|name| name.contains("main")));
    assert!(all
        .commits
        .iter()
        .any(|c| c.refs.contains(&"feature".to_string())));
    let page = history(&r.root, 2, 0).unwrap();
    assert_eq!((page.commits.len(), page.more), (2, true));
    let rest = history(&r.root, 2, 2).unwrap();
    assert_eq!((rest.commits.len(), rest.more), (2, false));
    assert_eq!(
        history(&r.root, 10_000, 0).unwrap().commits.len(),
        4,
        "the page size is bounded, not the repo"
    );
}

#[test]
fn an_empty_repository_has_an_empty_history() {
    let dir = tempfile::tempdir().unwrap();
    git(dir.path(), &["init", "-b", "main"]);
    assert!(history(dir.path(), 10, 0).unwrap().commits.is_empty());
}

#[test]
fn blame_names_the_commit_for_each_line_and_marks_uncommitted_ones() {
    let r = repo();
    r.write("a.txt", "one\nTWO\nthree\n");
    r.commit("second");
    r.write("a.txt", "one\nTWO\nthree\nfour\n");
    let b = blame(&r.root, "a.txt").unwrap();
    assert_eq!(b.lines.len(), 4);
    let summary = |line: usize| b.commits[b.lines[line] as usize].summary.as_str();
    assert_eq!(summary(0), "first");
    assert_eq!(summary(1), "second");
    assert!(b.commits[b.lines[3] as usize].uncommitted);
    assert_eq!(b.commits[b.lines[0] as usize].author, "Test");
}

#[test]
fn blame_refuses_paths_outside_the_root_and_untracked_files() {
    let r = repo();
    assert!(blame(&r.root, "../outside.txt").is_err());
    assert!(blame(&r.root, "/etc/hosts").is_err());
    assert!(blame(&r.root, ".git/config").is_err());
    r.write("new.txt", "x\n");
    assert!(
        blame(&r.root, "new.txt").is_err(),
        "an untracked file has no history"
    );
    let long: String = "x\n".repeat(super::blame::MAX_LINES + 1);
    r.write("long.txt", &long);
    r.commit("long");
    assert!(blame(&r.root, "long.txt")
        .unwrap_err()
        .message()
        .contains("too many"));
}
