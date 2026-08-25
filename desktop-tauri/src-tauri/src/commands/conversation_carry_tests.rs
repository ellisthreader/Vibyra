use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use super::copy_transcript;

/// A throwaway stand-in for one account's transcript root.
fn root(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("vibyra-carry-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).expect("fixture root");
    path
}

fn write(path: &Path, body: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("parent");
    }
    std::fs::write(path, body).expect("transcript");
}

fn age(path: &Path, seconds: u64) {
    let when = SystemTime::now() - Duration::from_secs(seconds);
    let file = std::fs::File::options()
        .write(true)
        .open(path)
        .expect("open for touch");
    file.set_modified(when).expect("set modified");
}

fn read(path: &Path) -> String {
    std::fs::read_to_string(path).expect("read back")
}

/// The ordinary switch: the new account has never seen this conversation.
#[test]
fn copies_a_transcript_the_destination_does_not_have() {
    let from = root("plain-from");
    let to = root("plain-to");
    let source = from.join("-home-ellis-Vibyra/chat.jsonl");
    let destination = to.join("-home-ellis-Vibyra/chat.jsonl");
    write(&source, "first account\n");

    assert!(copy_transcript(&source, &destination));
    assert_eq!(read(&destination), "first account\n");
}

/// Claude nests by project and Codex by date; neither folder exists yet under
/// an account that has only just been signed in.
#[test]
fn creates_the_folders_the_transcript_lives_under() {
    let from = root("nested-from");
    let to = root("nested-to");
    let relative = Path::new("2026/08/25/rollout-2026-08-25T10-00-00-abc.jsonl");
    let source = from.join(relative);
    write(&source, "rollout\n");

    assert!(copy_transcript(&source, &to.join(relative)));
    assert!(to.join(relative).is_file());
}

/// Switching back after sending more messages must not restore the old copy.
#[test]
fn an_older_source_never_clobbers_a_newer_destination() {
    let from = root("stale-from");
    let to = root("stale-to");
    let source = from.join("chat.jsonl");
    let destination = to.join("chat.jsonl");
    write(&source, "stale\n");
    write(&destination, "kept talking here\n");
    age(&source, 600);

    // Reported as carried, because the destination can resume it — which is
    // the question the caller is actually asking.
    assert!(copy_transcript(&source, &destination));
    assert_eq!(read(&destination), "kept talking here\n");
}

/// The other direction of the same switch: the account being left is the one
/// that has just been written to, so its copy has to win.
#[test]
fn a_newer_source_replaces_an_older_destination() {
    let from = root("fresh-from");
    let to = root("fresh-to");
    let source = from.join("chat.jsonl");
    let destination = to.join("chat.jsonl");
    write(&destination, "old\n");
    write(&source, "new messages\n");
    age(&destination, 600);

    assert!(copy_transcript(&source, &destination));
    assert_eq!(read(&destination), "new messages\n");
}

/// A pane opened but never spoken to owns an id that names no file. That is a
/// fresh start, not a failure.
#[test]
fn a_missing_source_does_not_carry() {
    let from = root("absent-from");
    let to = root("absent-to");
    assert!(!copy_transcript(
        &from.join("chat.jsonl"),
        &to.join("chat.jsonl")
    ));
}
