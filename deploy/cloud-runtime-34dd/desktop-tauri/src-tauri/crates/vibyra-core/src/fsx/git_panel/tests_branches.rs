use super::tests_support::*;
use super::{
    branches, create_branch, stash_list, stash_pop, stash_save, switch_branch, SwitchMode,
    DIRTY_PREFIX,
};

#[test]
fn branches_list_current_dirty_and_tracking() {
    let r = repo();
    r.git(&["branch", "other"]);
    r.write("a.txt", "changed\n");
    let list = branches(&r.root).unwrap();
    assert_eq!(list.current.as_deref(), Some("main"));
    assert_eq!(list.dirty, 1);
    assert_eq!(list.branches.len(), 2);
    assert!(list.branches.iter().any(|b| b.name == "main" && b.current));
}

#[test]
fn a_dirty_tree_refuses_the_switch_and_the_file_is_untouched() {
    let r = repo();
    r.git(&["branch", "other"]);
    r.write("a.txt", "mine\n");
    let error = switch_branch(&r.root, "other", SwitchMode::Refuse).unwrap_err();
    assert!(error.message().starts_with(DIRTY_PREFIX));
    assert_eq!(r.git(&["symbolic-ref", "--short", "HEAD"]), "main");
    assert_eq!(r.read("a.txt"), "mine\n");
}

#[test]
fn stash_and_switch_saves_the_changes_and_moves() {
    let r = repo();
    r.git(&["branch", "other"]);
    r.write("a.txt", "mine\n");
    let outcome = switch_branch(&r.root, "other", SwitchMode::Stash).unwrap();
    assert!(outcome.stashed);
    assert_eq!(r.git(&["symbolic-ref", "--short", "HEAD"]), "other");
    assert_eq!(r.read("a.txt"), "one\ntwo\nthree\n");
    let stashes = stash_list(&r.root).unwrap();
    assert_eq!(stashes.len(), 1);
    assert!(stashes[0].message.contains("before switching to other"));
    switch_branch(&r.root, "main", SwitchMode::Refuse).unwrap();
    assert!(!stash_pop(&r.root, 0).unwrap().conflicts);
    assert_eq!(r.read("a.txt"), "mine\n");
    assert!(stash_list(&r.root).unwrap().is_empty());
}

#[test]
fn a_clean_switch_just_switches_and_unknown_branches_are_refused() {
    let r = repo();
    r.git(&["branch", "other"]);
    assert!(
        !switch_branch(&r.root, "other", SwitchMode::Refuse)
            .unwrap()
            .stashed
    );
    assert!(switch_branch(&r.root, "ghost", SwitchMode::Refuse).is_err());
    assert!(switch_branch(&r.root, "-f", SwitchMode::Stash).is_err());
}

#[test]
fn create_validates_names_and_never_overwrites() {
    let r = repo();
    for bad in [
        "", "-x", "a b", "a..b", "a/", "x.lock", "a@{b", "--force", "a~1", ".hidden",
    ] {
        assert!(
            create_branch(&r.root, bad, true).is_err(),
            "{bad:?} must be refused"
        );
    }
    assert!(create_branch(&r.root, "main", false).is_err());
    r.write("a.txt", "carried\n");
    let made = create_branch(&r.root, "feature/x", true).unwrap();
    assert_eq!(made.branch, "feature/x");
    assert_eq!(r.git(&["symbolic-ref", "--short", "HEAD"]), "feature/x");
    assert_eq!(
        r.read("a.txt"),
        "carried\n",
        "a new branch carries the changes"
    );
    create_branch(&r.root, "plain", false).unwrap();
    assert_eq!(r.git(&["symbolic-ref", "--short", "HEAD"]), "feature/x");
}

#[test]
fn stash_save_needs_changes_and_pop_validates_the_index() {
    let r = repo();
    assert!(stash_save(&r.root, "nothing").is_err());
    r.write("a.txt", "work\n");
    stash_save(&r.root, "  my work  ").unwrap();
    assert_eq!(r.read("a.txt"), "one\ntwo\nthree\n");
    assert!(stash_list(&r.root).unwrap()[0].message.contains("my work"));
    assert!(stash_pop(&r.root, 7).is_err());
    assert!(stash_pop(&r.root, 9_999).is_err());
    stash_pop(&r.root, 0).unwrap();
    assert_eq!(r.read("a.txt"), "work\n");
}

#[test]
fn a_stash_that_conflicts_is_kept_and_reported() {
    let r = repo();
    r.write("a.txt", "stashed\n");
    stash_save(&r.root, "s").unwrap();
    r.write("a.txt", "committed other\n");
    r.commit("other");
    let outcome = stash_pop(&r.root, 0).unwrap();
    assert!(outcome.conflicts);
    assert_eq!(stash_list(&r.root).unwrap().len(), 1, "git keeps the stash");
    assert_eq!(branches(&r.root).unwrap().conflicts, 1);
    assert!(
        switch_branch(&r.root, "main", SwitchMode::Stash).is_ok(),
        "switching to the current branch is a no-op"
    );
}
