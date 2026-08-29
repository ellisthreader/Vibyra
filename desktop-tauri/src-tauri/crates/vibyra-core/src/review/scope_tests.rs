use std::path::{Path, PathBuf};

use crate::workspace::{prepare_safe_workspace, SafeWorkspace};

use super::tests::{read_lf, repo_and_worktree, run};
use super::{file_diff, merge_back, worktree_status};

/// The ceiling `worktree_status` puts on its file list, restated here because
/// the constant is private to `status`.
const MAX_FILES: usize = 2_000;

fn committed_repo(temp: &Path, files: &[(&str, &str)]) -> PathBuf {
    let repo = temp.join("repo");
    for (path, body) in files {
        let target = repo.join(path);
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(target, body).unwrap();
    }
    run(&repo, &["init"]);
    run(&repo, &["add", "."]);
    run(&repo, &["commit", "-m", "initial"]);
    repo
}

/// A monorepo: the project the user launched is a subfolder, so `safe.cwd`
/// is `<worktree>/app` and everything above it used to be invisible.
fn monorepo(temp: &Path) -> (PathBuf, SafeWorkspace) {
    let repo = committed_repo(
        temp,
        &[("app/main.txt", "app\n"), ("shared/lib.txt", "shared\n")],
    );
    let safe = prepare_safe_workspace(&repo.join("app"), &temp.join("worktrees"), None).unwrap();
    (repo, safe)
}

#[test]
fn changes_outside_the_project_folder_are_reviewed_and_merged() {
    let temp = tempfile::tempdir().unwrap();
    let (repo, safe) = monorepo(temp.path());
    std::fs::write(safe.cwd.join("main.txt"), "app changed\n").unwrap();
    let root = safe.cwd.parent().unwrap();
    std::fs::write(root.join("shared").join("lib.txt"), "shared changed\n").unwrap();

    let status = worktree_status(&safe.cwd, &safe.base_commit).unwrap();
    let paths: Vec<&str> = status
        .changed
        .iter()
        .map(|file| file.path.as_str())
        .collect();
    assert_eq!(paths, vec!["app/main.txt", "shared/lib.txt"]);

    // Repo-root-relative is one frame, and the diff has to read it too — as a
    // subfolder pathspec these never matched and fell through to untracked.
    let diff = file_diff(&safe.cwd, &safe.base_commit, "shared/lib.txt").unwrap();
    assert!(diff.contains("+shared changed"));

    let outcome = merge_back(&repo.join("app"), &safe.cwd, &safe.base_commit, &[]).unwrap();
    assert!(outcome.applied, "{:?}", outcome.conflicts);
    assert_eq!(read_lf(&repo.join("shared/lib.txt")), "shared changed\n");
    assert_eq!(read_lf(&repo.join("app/main.txt")), "app changed\n");
}

#[test]
fn three_way_lands_when_the_project_moved_in_another_hunk() {
    let temp = tempfile::tempdir().unwrap();
    let base = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\n";
    let repo = committed_repo(temp.path(), &[("f.txt", base)]);
    let safe = prepare_safe_workspace(&repo, &temp.path().join("worktrees"), None).unwrap();

    std::fs::write(safe.cwd.join("f.txt"), base.replace("\nf\n", "\nAGENT\n")).unwrap();
    // A different line, close enough that plain apply loses its context.
    std::fs::write(repo.join("f.txt"), base.replace("\nd\n", "\nUSER\n")).unwrap();

    let outcome = merge_back(&repo, &safe.cwd, &safe.base_commit, &[]).unwrap();
    assert!(outcome.applied, "{:?}", outcome.conflicts);
    assert_eq!(
        read_lf(&repo.join("f.txt")),
        base.replace("\nd\n", "\nUSER\n")
            .replace("\nf\n", "\nAGENT\n")
    );
    // Three-way implies `--index`, so it runs through a scratch one; the
    // user's index has to come out of this untouched.
    assert!(
        crate::workspace_preflight::git(&repo, &["diff", "--cached", "--name-only"])
            .unwrap()
            .is_empty()
    );
}

#[test]
fn a_path_selection_lands_exactly_what_was_chosen() {
    let temp = tempfile::tempdir().unwrap();
    let files: Vec<(String, String)> = (0..5)
        .map(|index| (format!("f{index}.txt"), format!("base {index}\n")))
        .collect();
    let seed: Vec<(&str, &str)> = files
        .iter()
        .map(|(path, body)| (path.as_str(), body.as_str()))
        .collect();
    let repo = committed_repo(temp.path(), &seed);
    let safe = prepare_safe_workspace(&repo, &temp.path().join("worktrees"), None).unwrap();
    for (path, _) in &files {
        std::fs::write(safe.cwd.join(path), format!("agent {path}\n")).unwrap();
    }

    let chosen: Vec<String> = files[..3].iter().map(|(path, _)| path.clone()).collect();
    let outcome = merge_back(&repo, &safe.cwd, &safe.base_commit, &chosen).unwrap();
    assert!(outcome.applied, "{:?}", outcome.conflicts);
    for (index, (path, body)) in files.iter().enumerate() {
        let landed = index < 3;
        assert_eq!(
            read_lf(&repo.join(path)),
            if landed {
                format!("agent {path}\n")
            } else {
                body.clone()
            }
        );
        // What was left behind is still in the worktree to land later.
        assert_eq!(read_lf(&safe.cwd.join(path)), format!("agent {path}\n"));
    }
    assert!(merge_back(
        &repo,
        &safe.cwd,
        &safe.base_commit,
        &["../escape".to_string()]
    )
    .is_err());
}

#[test]
fn a_large_untracked_tree_truncates_before_it_is_read() {
    let temp = tempfile::tempdir().unwrap();
    let (_repo, safe) = repo_and_worktree(temp.path());
    let generated = safe.cwd.join("generated");
    std::fs::create_dir_all(&generated).unwrap();
    for index in 0..MAX_FILES + 100 {
        std::fs::write(generated.join(format!("f{index:05}.txt")), "one\n").unwrap();
    }

    let status = worktree_status(&safe.cwd, &safe.base_commit).unwrap();
    assert!(status.truncated);
    assert_eq!(status.changed.len(), MAX_FILES);
}

/// A `vibyra/*` branch name proves the worktree is Vibyra's; it does not
/// prove it belongs to the repository the renderer handed over. Both
/// destructive paths must refuse a workspace from a different repository
/// before touching anything.
#[test]
fn a_worktree_from_another_repository_is_refused() {
    let temp = tempfile::tempdir().unwrap();
    let repo_a = committed_repo(&temp.path().join("a"), &[("main.txt", "a\n")]);
    let repo_b = committed_repo(&temp.path().join("b"), &[("main.txt", "b\n")]);
    let safe_b = prepare_safe_workspace(&repo_b, &temp.path().join("worktrees"), None).unwrap();
    std::fs::write(safe_b.cwd.join("main.txt"), "changed\n").unwrap();

    assert!(merge_back(&repo_a, &safe_b.cwd, &safe_b.base_commit, &[]).is_err());
    assert_eq!(read_lf(&repo_a.join("main.txt")), "a\n");
    assert!(super::discard_worktree(&repo_a, &safe_b.cwd).is_err());
    assert!(safe_b.cwd.is_dir());

    // The same workspace against its own repository still works.
    assert!(
        merge_back(&repo_b, &safe_b.cwd, &safe_b.base_commit, &[])
            .unwrap()
            .applied
    );
}
