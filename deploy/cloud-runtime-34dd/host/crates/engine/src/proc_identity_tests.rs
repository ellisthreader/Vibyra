use super::*;
use std::os::unix::fs::symlink;

const ID_A: &str = "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8091";
const ID_B: &str = "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8092";

/// A fake `/proc`: `(pid, parent, open files)`.
fn proc(entries: &[(u32, u32, &[&Path])]) -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    for (pid, parent, files) in entries {
        let dir = root.path().join(pid.to_string());
        std::fs::create_dir_all(dir.join("fd")).unwrap();
        std::fs::write(
            dir.join("stat"),
            format!("{pid} (codex (wrap)) S {parent} 1"),
        )
        .unwrap();
        for (index, file) in files.iter().enumerate() {
            symlink(file, dir.join(format!("fd/{}", index + 3))).unwrap();
        }
        symlink("socket:[1]", dir.join("fd/99")).unwrap();
    }
    root
}

fn rollout(home: &Path, id: &str) -> std::path::PathBuf {
    home.join(format!(
        "sessions/2026/10/02/rollout-2026-10-02T09-30-00-{id}.jsonl"
    ))
}

#[test]
fn rollout_names_yield_their_id_only_under_the_codex_home() {
    let home = Path::new("/data/home/.codex");
    assert_eq!(
        rollout_id(&rollout(home, ID_A), home).as_deref(),
        Some(ID_A)
    );
    assert_eq!(
        rollout_id(&rollout(Path::new("/elsewhere"), ID_A), home),
        None
    );
    assert_eq!(
        rollout_id(&home.join("sessions/2026/rollout-x-not-a-uuid.jsonl"), home),
        None
    );
    assert_eq!(
        rollout_id(&home.join("sessions/2026/notes.jsonl"), home),
        None
    );
}

#[test]
fn the_wrapper_or_its_child_may_hold_the_rollout() {
    let dir = tempfile::tempdir().unwrap();
    // `/proc` shows canonical paths, and so must the fake one.
    let home = dir.path().canonicalize().unwrap();
    let file = rollout(&home, ID_A);
    let held = proc(&[
        (10, 1, &[]),
        (11, 10, &[]),
        (12, 11, &[&file]),
        (20, 1, &[&rollout(&home, ID_B)]),
    ]);
    assert_eq!(discover(held.path(), 10, &home).as_deref(), Some(ID_A));
    // The other terminal's family is not looked at.
    assert_eq!(discover(held.path(), 20, &home).as_deref(), Some(ID_B));
}

#[test]
fn no_open_rollout_or_missing_process_finds_nothing() {
    let home = tempfile::tempdir().unwrap();
    let held = proc(&[(10, 1, &[Path::new("/etc/hostname")])]);
    assert_eq!(discover(held.path(), 10, home.path()), None);
    assert_eq!(discover(held.path(), 777, home.path()), None);
    assert_eq!(
        discover(Path::new("/nonexistent-proc"), 10, home.path()),
        None
    );
}

#[test]
fn two_rollouts_at_the_same_depth_are_ambiguous() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().canonicalize().unwrap();
    let held = proc(&[(10, 1, &[&rollout(&home, ID_A), &rollout(&home, ID_B)])]);
    assert_eq!(discover(held.path(), 10, &home), None);
}

#[test]
fn parent_ids_survive_odd_command_names() {
    assert_eq!(parent_id("10 (node launcher (cli)) S 7 10 0"), Some(7));
    assert_eq!(parent_id("truncated"), None);
}
