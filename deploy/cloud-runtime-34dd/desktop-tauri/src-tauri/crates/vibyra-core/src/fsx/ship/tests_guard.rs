use super::tests_support::{fixture, git, github_like};
use super::*;
use crate::fsx::worktree_status::facts;
use std::path::Path;
use std::sync::atomic::AtomicBool;

fn no_cancel() -> AtomicBool {
    AtomicBool::new(false)
}

#[test]
fn only_agent_branches_in_linked_worktrees_are_ever_shipped() {
    let fx = fixture();
    let main = fx.repo.to_str().unwrap();
    let main_tree = commit(fx.project(), main, "x", None, &no_cancel()).unwrap_err();
    assert!(main_tree.message().contains("main working folder"));
    let stranger = push(fx.project(), "/tmp", &github_like, &no_cancel()).unwrap_err();
    assert!(stranger.message().contains("not one of this project"));
    // The default branch, found from origin/HEAD, and a plain `master`.
    git(&fx.repo, &["branch", "develop"]);
    git(&fx.repo, &["push", "origin", "develop"]);
    git(&fx.repo, &["remote", "set-head", "origin", "develop"]);
    let develop = fx.dir.path().join("develop-tree");
    git(
        &fx.repo,
        &["worktree", "add", develop.to_str().unwrap(), "develop"],
    );
    let master = fx.dir.path().join("master-tree");
    git(
        &fx.repo,
        &["worktree", "add", "-b", "master", master.to_str().unwrap()],
    );
    let detached = fx.dir.path().join("detached-tree");
    git(
        &fx.repo,
        &["worktree", "add", "--detach", detached.to_str().unwrap()],
    );
    let listed = crate::fsx::worktrees::read_inventory(fx.project())
        .unwrap()
        .worktrees;
    for branch in ["develop", "master", "Detached HEAD"] {
        let root = &listed.iter().find(|t| t.branch == branch).unwrap().root;
        std::fs::write(Path::new(root).join("z.txt"), "z").unwrap();
        let c = commit(fx.project(), root, "x", None, &no_cancel()).unwrap_err();
        let p = push(fx.project(), root, &github_like, &no_cancel()).unwrap_err();
        for e in [c, p] {
            assert!(
                e.message().contains("default branch") || e.message().contains("detached"),
                "{branch}: {e}"
            );
        }
    }
    assert_eq!(
        git(&fx.bare, &["rev-parse", "refs/heads/main"]),
        git(&fx.repo, &["rev-parse", "main"])
    );
}

#[test]
fn only_an_accepted_remote_receives_a_push() {
    let fx = fixture();
    fx.write("a.txt", "a\n");
    commit(fx.project(), &fx.tree, "Add a", None, &no_cancel()).unwrap();
    let refused = push(fx.project(), &fx.tree, &|_| false, &no_cancel()).unwrap_err();
    assert!(refused
        .message()
        .contains("only pushes to a GitHub repository"));
    let nothing = fixture();
    let early = push(nothing.project(), &nothing.tree, &github_like, &no_cancel()).unwrap_err();
    assert!(early.message().contains("nothing to push"));
}

#[test]
fn a_merged_worktree_is_removed_only_when_nothing_would_be_lost() {
    let fx = fixture();
    fx.write("a.txt", "a\n");
    let done = commit(fx.project(), &fx.tree, "Add a", None, &no_cancel()).unwrap();
    push(fx.project(), &fx.tree, &github_like, &no_cancel()).unwrap();
    fx.write("later.txt", "later\n");
    let dirty = remove_worktree(fx.project(), &fx.tree, &done.sha).unwrap_err();
    assert!(dirty.message().contains("uncommitted"));
    std::fs::remove_file(fx.path("later.txt")).unwrap();
    let other = remove_worktree(fx.project(), &fx.tree, &"0".repeat(40)).unwrap_err();
    assert!(other.message().contains("not part of the merge"));
    assert!(facts(Path::new(&fx.tree)).is_ok());
    let outcome = remove_worktree(fx.project(), &fx.tree, &done.sha).unwrap();
    assert!(outcome.removed && outcome.branch_deleted);
    assert!(!Path::new(&fx.tree).exists());
    assert!(git(&fx.repo, &["branch", "--list", "vibyra/task"]).is_empty());
}
