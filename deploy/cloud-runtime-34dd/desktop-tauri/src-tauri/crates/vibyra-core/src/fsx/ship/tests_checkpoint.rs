use super::tests_support::{fixture, git};
use super::*;
use std::path::Path;

fn make(fx: &super::tests_support::Fixture, label: &str) -> Checkpoint {
    create_checkpoint(fx.project(), &fx.tree, None, label).unwrap()
}

fn restore(fx: &super::tests_support::Fixture, n: u32) -> RestoreOutcome {
    restore_checkpoint(fx.project(), &fx.tree, None, n, None).unwrap()
}

/// Every non-ignored file under the worktree, with its bytes.
fn files(fx: &super::tests_support::Fixture) -> Vec<(String, Vec<u8>)> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<(String, Vec<u8>)>) {
        for entry in std::fs::read_dir(dir).unwrap().flatten() {
            let path = entry.path();
            let name = path
                .strip_prefix(base)
                .unwrap()
                .to_string_lossy()
                .into_owned();
            if name == ".git" || name == "ignored.log" {
                continue;
            }
            if path.is_dir() {
                walk(base, &path, out);
            } else {
                out.push((name, std::fs::read(&path).unwrap()));
            }
        }
    }
    let mut out = Vec::new();
    walk(Path::new(&fx.tree), Path::new(&fx.tree), &mut out);
    out.sort();
    out
}

#[test]
fn restores_dirty_untracked_deleted_renamed_and_binary_files_exactly() {
    let fx = fixture();
    let binary = vec![0u8, 159, 146, 150, 255, 0, 1];
    fx.write("readme.txt", "changed readme\n");
    fx.write("notes/new.txt", "untracked\n");
    std::fs::write(fx.path("blob.bin"), &binary).unwrap();
    fx.write("keep.txt", "keep\n");
    fx.write("gone.txt", "tracked, then deleted\n");
    fx.git(&["add", "keep.txt", "gone.txt"]);
    fx.git(&["commit", "-m", "add keep"]);
    std::fs::rename(fx.path("keep.txt"), fx.path("kept.txt")).unwrap();
    std::fs::remove_file(fx.path("gone.txt")).unwrap();
    fx.write("ignored.log", "ignored stays\n");
    let head = fx.git(&["rev-parse", "HEAD"]);
    let index = fx.git(&["diff", "--cached", "--name-status"]);
    let first = make(&fx, "turn 1");
    let before = files(&fx);
    // The agent carries on and ruins everything.
    fx.write("readme.txt", "ruined\n");
    std::fs::remove_file(fx.path("notes/new.txt")).unwrap();
    std::fs::remove_dir(fx.path("notes")).unwrap();
    std::fs::write(fx.path("blob.bin"), b"zzz").unwrap();
    std::fs::create_dir_all(fx.path("moved")).unwrap();
    std::fs::rename(fx.path("kept.txt"), fx.path("moved/kept.txt")).unwrap();
    fx.write("ignored.log", "ignored changed\n");
    fx.write("extra.txt", "extra\n");
    let outcome = restore(&fx, first.n);
    assert!(outcome.changed >= 5);
    assert_eq!(files(&fx), before);
    assert_eq!(std::fs::read(fx.path("blob.bin")).unwrap(), binary);
    assert_eq!(fx.read("ignored.log"), "ignored changed\n");
    // Branch, index and stash were never part of it.
    assert_eq!(fx.git(&["rev-parse", "HEAD"]), head);
    assert_eq!(fx.git(&["diff", "--cached", "--name-status"]), index);
    assert_eq!(fx.git(&["stash", "list"]), "");
}

#[test]
fn a_restore_is_itself_undoable() {
    let fx = fixture();
    fx.write("a.txt", "one\n");
    let first = make(&fx, "one");
    fx.write("a.txt", "two\n");
    fx.write("b.txt", "only in two\n");
    let two_state = files(&fx);
    let outcome = restore(&fx, first.n);
    assert_eq!(fx.read("a.txt"), "one\n");
    assert!(!fx.path("b.txt").exists());
    let safety = outcome.safety.expect("restore saves the state it replaces");
    assert!(safety.label.contains("Before restoring"));
    restore(&fx, safety.n);
    assert_eq!(files(&fx), two_state);
    assert_eq!(
        list_checkpoints(fx.project(), &fx.tree, None)
            .unwrap()
            .len(),
        3
    );
}

#[test]
fn a_write_during_restore_stops_it_before_anything_changes() {
    let fx = fixture();
    fx.write("a.txt", "one\n");
    let first = make(&fx, "one");
    fx.write("a.txt", "two\n");
    let agent = || std::fs::write(Path::new(&fx.tree).join("a.txt"), "agent was here\n").unwrap();
    let error =
        restore_checkpoint(fx.project(), &fx.tree, None, first.n, Some(&agent)).unwrap_err();
    assert!(
        error.message().contains("changed while restoring"),
        "{error}"
    );
    assert_eq!(fx.read("a.txt"), "agent was here\n");
}

#[test]
fn checkpoints_are_bounded_deduplicated_and_numbered_on() {
    let fx = fixture();
    let first = make(&fx, "same");
    assert_eq!(make(&fx, "again").n, first.n);
    for i in 0..(MAX_CHECKPOINTS + 2) {
        fx.write("a.txt", &format!("{i}\n"));
        make(&fx, &format!("turn {i}"));
    }
    let kept = list_checkpoints(fx.project(), &fx.tree, None).unwrap();
    assert_eq!(kept.len(), MAX_CHECKPOINTS);
    assert_eq!(kept.last().unwrap().n, (MAX_CHECKPOINTS + 3) as u32);
    assert!(kept
        .iter()
        .all(|c| c.reference.starts_with("refs/vibyra/checkpoints/")));
    assert_eq!(
        fx.git(&["rev-parse", "--abbrev-ref", "HEAD"]),
        "vibyra/task"
    );
}

#[test]
fn a_huge_file_is_refused_without_saving_anything() {
    let fx = fixture();
    std::fs::write(fx.path("big.bin"), vec![7u8; 9 * 1024 * 1024]).unwrap();
    let error = create_checkpoint(fx.project(), &fx.tree, None, "big").unwrap_err();
    assert!(error.message().contains("too large"));
    assert!(list_checkpoints(fx.project(), &fx.tree, None)
        .unwrap()
        .is_empty());
    assert_eq!(fx.git(&["for-each-ref", "refs/vibyra"]), "");
}

#[test]
fn restore_never_writes_through_a_link_or_outside_the_worktree() {
    let fx = fixture();
    fx.write("dir/file.txt", "inside\n");
    let first = make(&fx, "real dir");
    let outside = fx.dir.path().join("outside");
    std::fs::create_dir_all(&outside).unwrap();
    std::fs::write(outside.join("file.txt"), "outside\n").unwrap();
    std::fs::remove_dir_all(fx.path("dir")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, fx.path("dir")).unwrap();
    restore(&fx, first.n);
    assert_eq!(fx.read("dir/file.txt"), "inside\n");
    assert_eq!(
        std::fs::read_to_string(outside.join("file.txt")).unwrap(),
        "outside\n"
    );
    for bad in ["../x", "a/b", "", "x y"] {
        assert!(
            list_checkpoints(fx.project(), &fx.tree, Some(bad)).is_err(),
            "{bad}"
        );
    }
    let main = fx.repo.to_str().unwrap();
    assert!(create_checkpoint(fx.project(), main, None, "main").is_err());
    git(&fx.repo, &["status"]);
}
