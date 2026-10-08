use super::tests_support::{fixture, git, github_like, identify};
use super::*;
use crate::fsx::worktree_status::{facts, worktree_status};
use std::path::Path;
use std::sync::atomic::AtomicBool;

fn no_cancel() -> AtomicBool {
    AtomicBool::new(false)
}

#[test]
fn facts_follow_one_branch_from_changes_to_pushed() {
    let fx = fixture();
    let fresh = worktree_status(fx.project(), &fx.tree).unwrap();
    assert_eq!(
        (fresh.dirty, fresh.ahead_of_base, fresh.upstream.clone()),
        (0, 0, None)
    );
    assert_eq!(fresh.default_branch.as_deref(), Some("main"));
    fx.write("a.txt", "one\n");
    let dirty = worktree_status(fx.project(), &fx.tree).unwrap();
    assert_eq!((dirty.dirty, dirty.untracked, dirty.staged), (1, 1, 0));
    let done = commit(fx.project(), &fx.tree, "Add a\n\nbody", None, &no_cancel()).unwrap();
    assert_eq!(done.subject, "Add a");
    let committed = worktree_status(fx.project(), &fx.tree).unwrap();
    assert_eq!(
        (committed.dirty, committed.ahead_of_base, committed.ahead),
        (0, 1, None)
    );
    assert_eq!(committed.last_commit.unwrap().subject, "Add a");
    let pushed = push(fx.project(), &fx.tree, &github_like, &no_cancel()).unwrap();
    assert_eq!(pushed.upstream, "origin/vibyra/task");
    assert_eq!(fx.remote_head("vibyra/task"), done.sha);
    let after = worktree_status(fx.project(), &fx.tree).unwrap();
    assert_eq!(
        (after.ahead, after.behind, after.upstream.as_deref()),
        (Some(0), Some(0), Some("origin/vibyra/task"))
    );
}

#[test]
fn commits_only_the_chosen_files_and_refuses_what_it_cannot_honour() {
    let fx = fixture();
    fx.write("a.txt", "a\n");
    fx.write("b.txt", "b\n");
    let none = commit(fx.project(), &fx.tree, "  ", None, &no_cancel()).unwrap_err();
    assert!(none.message().contains("commit message"));
    let outside = commit(
        fx.project(),
        &fx.tree,
        "x",
        Some(&["../escape".into()]),
        &no_cancel(),
    );
    assert!(outside.unwrap_err().message().contains("no changes"));
    let one = commit(
        fx.project(),
        &fx.tree,
        "Only a",
        Some(&["a.txt".into()]),
        &no_cancel(),
    )
    .unwrap();
    assert_eq!(one.files, 1);
    assert_eq!(
        fx.git(&["show", "--name-only", "--format=", "HEAD"]),
        "a.txt"
    );
    assert!(worktree_status(fx.project(), &fx.tree).unwrap().untracked == 1);
    fx.git(&["add", "b.txt"]);
    fx.write("c.txt", "c\n");
    let staged = commit(
        fx.project(),
        &fx.tree,
        "x",
        Some(&["c.txt".into()]),
        &no_cancel(),
    );
    assert!(staged.unwrap_err().message().contains("already staged"));
    commit(fx.project(), &fx.tree, "Rest", None, &no_cancel()).unwrap();
    let empty = commit(fx.project(), &fx.tree, "Nothing", None, &no_cancel()).unwrap_err();
    assert!(empty.message().contains("nothing to commit"));
}

#[test]
fn commit_hooks_never_run() {
    let fx = fixture();
    let hooks = fx.repo.join(".git/hooks");
    std::fs::write(
        hooks.join("pre-commit"),
        "#!/bin/sh\ntouch hook-ran\nexit 1\n",
    )
    .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(
            hooks.join("pre-commit"),
            std::fs::Permissions::from_mode(0o755),
        )
        .unwrap();
    }
    fx.write("a.txt", "a\n");
    commit(fx.project(), &fx.tree, "Add a", None, &no_cancel()).unwrap();
    assert!(!fx.path("hook-ran").exists());
}

#[test]
fn a_remote_that_moved_on_is_never_overwritten() {
    let fx = fixture();
    fx.write("a.txt", "a\n");
    commit(fx.project(), &fx.tree, "Add a", None, &no_cancel()).unwrap();
    push(fx.project(), &fx.tree, &github_like, &no_cancel()).unwrap();
    // Someone else advances the branch on the remote.
    let other = fx.dir.path().join("other");
    git(
        fx.dir.path(),
        &["clone", fx.bare.to_str().unwrap(), other.to_str().unwrap()],
    );
    identify(&other);
    git(&other, &["checkout", "vibyra/task"]);
    std::fs::write(other.join("theirs.txt"), "theirs\n").unwrap();
    git(&other, &["add", "."]);
    git(&other, &["commit", "-m", "theirs"]);
    git(&other, &["push", "origin", "vibyra/task"]);
    let theirs = fx.remote_head("vibyra/task");
    // Even a configured force refspec must not apply to Vibyra's push.
    git(
        &fx.repo,
        &["config", "remote.origin.push", "+refs/heads/*:refs/heads/*"],
    );
    fx.write("b.txt", "b\n");
    commit(fx.project(), &fx.tree, "Add b", None, &no_cancel()).unwrap();
    let error = push(fx.project(), &fx.tree, &github_like, &no_cancel()).unwrap_err();
    assert!(error.message().contains("never force-pushes"), "{error}");
    assert_eq!(fx.remote_head("vibyra/task"), theirs);
    // Once the clone has fetched, the refusal needs no network at all.
    fx.git(&["fetch", "origin"]);
    let behind = push(fx.project(), &fx.tree, &github_like, &no_cancel()).unwrap_err();
    assert!(behind.message().contains("never force-pushes"));
    assert_eq!(fx.remote_head("vibyra/task"), theirs);
}
