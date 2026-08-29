use std::fs::{File, FileTimes};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use super::super::tests::run;
use super::{list_worktrees, prune_worktrees};

/// Adds a worktree, commits inside it when `advance` is set, then deletes the
/// folder — the state a crash or a pane closed with the X leaves behind.
fn stranded(repo: &Path, roots: &Path, branch: &str, advance: bool) -> PathBuf {
    let path = roots.join(branch.replace('/', "-"));
    run(
        repo,
        &["worktree", "add", "-b", branch, &path.to_string_lossy()],
    );
    if advance {
        std::fs::write(path.join(branch.replace('/', "-")), "work\n").unwrap();
        run(&path, &["add", "-A"]);
        run(&path, &["commit", "-m", "agent work"]);
    }
    std::fs::remove_dir_all(&path).unwrap();
    path
}

fn age(path: &Path) {
    let file = File::options().write(true).open(path).unwrap();
    let old = SystemTime::now() - Duration::from_secs(6 * 60 * 60);
    file.set_times(FileTimes::new().set_modified(old)).unwrap();
}

#[test]
fn lists_only_vibyra_worktrees_and_says_which_are_gone() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    run(&repo, &["init"]);
    std::fs::write(repo.join("seed.txt"), "seed\n").unwrap();
    run(&repo, &["add", "."]);
    run(&repo, &["commit", "-m", "initial"]);
    let roots = temp.path().join("worktrees");
    std::fs::create_dir_all(&roots).unwrap();

    let live = roots.join("live");
    run(
        &repo,
        &[
            "worktree",
            "add",
            "-b",
            "vibyra/live",
            &live.to_string_lossy(),
        ],
    );
    stranded(&repo, &roots, "vibyra/gone", false);
    let mine = roots.join("mine");
    run(
        &repo,
        &[
            "worktree",
            "add",
            "-b",
            "feature/mine",
            &mine.to_string_lossy(),
        ],
    );

    let listed = list_worktrees(&repo).unwrap();
    let mut branches: Vec<&str> = listed.iter().map(|entry| entry.branch.as_str()).collect();
    branches.sort();
    // The user's own worktree is not ours to list, let alone reap.
    assert_eq!(branches, vec!["vibyra/gone", "vibyra/live"]);

    let find = |branch: &str| {
        listed
            .iter()
            .find(|entry| entry.branch == branch)
            .expect(branch)
    };
    assert!(!find("vibyra/gone").exists);
    assert!(find("vibyra/live").exists);
    assert!(!find("vibyra/live").head.is_empty());
}

#[test]
fn pruning_reaps_merged_leftovers_and_refuses_everything_else() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    run(&repo, &["init"]);
    std::fs::write(repo.join("seed.txt"), "seed\n").unwrap();
    run(&repo, &["add", "."]);
    run(&repo, &["commit", "-m", "initial"]);
    let roots = temp.path().join("worktrees");
    std::fs::create_dir_all(&roots).unwrap();

    let live = roots.join("live");
    run(
        &repo,
        &[
            "worktree",
            "add",
            "-b",
            "vibyra/live",
            &live.to_string_lossy(),
        ],
    );
    stranded(&repo, &roots, "vibyra/landed", true);
    stranded(&repo, &roots, "vibyra/pending", true);
    stranded(&repo, &roots, "feature/theirs", true);
    // The landed branch came home; the pending one never did.
    run(&repo, &["merge", "--ff-only", "vibyra/landed"]);

    let stale = roots.join("snapshot-dead.index");
    std::fs::write(&stale, "").unwrap();
    age(&stale);
    let fresh = roots.join("snapshot-running.index");
    std::fs::write(&fresh, "").unwrap();

    let outcome = prune_worktrees(&repo).unwrap();
    assert_eq!(outcome.pruned_worktrees, 2);
    assert_eq!(outcome.deleted_branches, vec!["vibyra/landed".to_string()]);
    // A snapshot index a live launch is still writing must survive the sweep.
    assert_eq!(outcome.swept_files, 1);
    assert!(!stale.exists());
    assert!(fresh.exists());

    let branches =
        crate::workspace_preflight::git(&repo, &["branch", "--format=%(refname:short)"]).unwrap();
    assert!(branches.contains("vibyra/pending"), "{branches}");
    assert!(branches.contains("vibyra/live"), "{branches}");
    assert!(branches.contains("feature/theirs"), "{branches}");
    assert!(!branches.contains("vibyra/landed"), "{branches}");
}
