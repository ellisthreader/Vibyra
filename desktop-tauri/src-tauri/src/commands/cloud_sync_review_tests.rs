//! The app's review and apply over a real engine and shadow repo (see `cloud_sync_review_scene`).

use super::cloud_sync_review::*;
use super::cloud_sync_review_scene::{scene, write};
use vibyra_sync::paths::project_key;
use vibyra_sync::state::Store;

#[test]
fn the_review_sorts_files_into_safe_conflicting_and_unapplicable() {
    let s = scene();
    write(&s.root, "c.txt", "three, edited here");
    let r = review(&s.engine, &s.project).unwrap().unwrap();
    assert_eq!(r.seq, 7);
    assert_eq!(
        r.review.changes,
        vec!["a.txt", "d.txt"],
        "a and d are untouched here, so they are safe"
    );
    assert_eq!(
        r.review.conflicts,
        vec!["c.txt"],
        "c was edited here and removed there"
    );
    assert_eq!(r.unapplied.len(), 1);
    assert_eq!(r.unapplied[0].path, "vendor/lib.php");
    let one = file_review(&s.engine, &s.project, "a.txt").unwrap();
    assert_eq!(one["base"]["text"], "one");
    assert_eq!(one["local"]["text"], "one");
    assert_eq!(one["cloud"]["text"], "ONE");
    assert!(
        file_review(&s.engine, &s.project, "b.txt").is_err(),
        "only reviewed files can be opened"
    );
}

#[test]
fn applying_backs_up_keeps_conflicts_and_dismisses_the_change() {
    let s = scene();
    write(&s.root, "c.txt", "three, edited here");
    let r = review(&s.engine, &s.project).unwrap().unwrap();
    let backup = s._state.path().join("backup");
    assert!(
        apply(&s.engine, &s.project, 6, &r.review.digest, &backup).is_err(),
        "a newer cloud change needs a new review"
    );
    let done = apply(&s.engine, &s.project, 7, &r.review.digest, &backup).unwrap();
    assert_eq!(
        std::fs::read_to_string(s.root.join("a.txt")).unwrap(),
        "ONE"
    );
    assert_eq!(
        std::fs::read_to_string(s.root.join("d.txt")).unwrap(),
        "four"
    );
    assert_eq!(
        std::fs::read_to_string(s.root.join("c.txt")).unwrap(),
        "three, edited here",
        "the Mac version of a conflict stays"
    );
    assert_eq!(
        std::fs::read_to_string(s.root.join("vendor/lib.php")).unwrap(),
        "v1",
        "dependency folders are never written"
    );
    assert!(
        backup.join("recovery.json").exists(),
        "originals were saved first"
    );
    assert_eq!(done["conflicts"][0], "c.txt");
    assert!(s.engine.pending_cloud_changes(&s.project).is_empty());
    assert!(review(&s.engine, &s.project).unwrap().is_none());
}

#[test]
fn a_file_edited_after_the_review_stops_the_apply() {
    let s = scene();
    let r = review(&s.engine, &s.project).unwrap().unwrap();
    write(&s.root, "a.txt", "edited after the review");
    let backup = s._state.path().join("backup");
    assert!(apply(&s.engine, &s.project, 7, &r.review.digest, &backup).is_err());
    assert_eq!(
        std::fs::read_to_string(s.root.join("a.txt")).unwrap(),
        "edited after the review"
    );
    assert!(
        !s.engine.pending_cloud_changes(&s.project).is_empty(),
        "nothing was dismissed"
    );
}

#[test]
fn quiet_apply_only_happens_when_everything_is_clean_and_handled() {
    let s = scene();
    let backup = s._state.path().join("quiet");
    // vendor/ cannot be written by this path, so even an otherwise clean change still needs a look.
    assert_eq!(auto_apply(&s.engine, &s.project, &backup).unwrap(), None);
    assert_eq!(
        std::fs::read_to_string(s.root.join("a.txt")).unwrap(),
        "one"
    );
    assert!(!s.engine.pending_cloud_changes(&s.project).is_empty());
}

#[test]
fn quiet_apply_writes_a_clean_change_with_a_backup_and_never_a_conflicting_one() {
    let s = scene();
    let store = Store::new(s._state.path());
    let key = project_key("p1");
    let mut st = store.load(&key);
    st.cloud[0].files.retain(|f| !f.path.starts_with("vendor/"));
    store.save(&st).unwrap();

    write(&s.root, "c.txt", "edited here");
    let backup = s._state.path().join("quiet-1");
    assert_eq!(
        auto_apply(&s.engine, &s.project, &backup).unwrap(),
        None,
        "a conflict waits for a person"
    );
    assert_eq!(
        std::fs::read_to_string(s.root.join("a.txt")).unwrap(),
        "one"
    );

    write(&s.root, "c.txt", "three");
    let backup = s._state.path().join("quiet-2");
    assert_eq!(
        auto_apply(&s.engine, &s.project, &backup).unwrap(),
        Some(3),
        "a, c removed, d added"
    );
    assert_eq!(
        std::fs::read_to_string(s.root.join("a.txt")).unwrap(),
        "ONE"
    );
    assert!(!s.root.join("c.txt").exists());
    assert!(backup.join("recovery.json").exists());
    assert!(s.engine.pending_cloud_changes(&s.project).is_empty());
}
