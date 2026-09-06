use super::{attachments, managed_paths};
use crate::agentdb::{ids::new_id, AgentDb};

#[test]
fn hostile_ids_never_reach_filesystem_effects() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let witness = outside.path().join("keep.txt");
    std::fs::write(&witness, "keep").unwrap();
    for id in [
        outside.path().to_str().unwrap(),
        "../escape",
        "..",
        "",
        "a/b",
        r"a\b",
    ] {
        assert!(attachments::discard(root.path(), id).is_err());
        assert!(attachments::folder(root.path(), id).is_err());
        assert!(witness.exists());
    }
}

#[test]
fn a_nonexistent_chat_cannot_copy_a_file() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("input.txt");
    std::fs::write(&source, "input").unwrap();
    let db = AgentDb::open_memory().unwrap();
    let id = new_id();
    assert!(attachments::attach(&db, root.path(), &id, source.to_str().unwrap()).is_err());
    assert!(!root.path().join("chats").exists());
}

#[cfg(unix)]
#[test]
fn symlinked_storage_is_refused_before_copy_or_delete() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let id = new_id();
    let witness = outside.path().join("keep.txt");
    std::fs::write(&witness, "keep").unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("chats")).unwrap();
    assert!(attachments::discard(root.path(), &id).is_err());
    assert!(witness.exists());
    std::fs::remove_file(root.path().join("chats")).unwrap();
    std::fs::create_dir(root.path().join("chats")).unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("chats").join(&id)).unwrap();
    assert!(attachments::discard(root.path(), &id).is_err());
    assert!(witness.exists());
}

#[test]
fn a_stored_attachment_path_cannot_delete_another_file() {
    let root = tempfile::tempdir().unwrap();
    let witness = root.path().join("keep.txt");
    std::fs::write(&witness, "keep").unwrap();
    assert!(managed_paths::remove_file(root.path(), &new_id(), witness.to_str().unwrap()).is_err());
    assert!(witness.exists());
}
