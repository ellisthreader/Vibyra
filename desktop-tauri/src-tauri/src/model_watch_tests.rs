use crate::model_watch::{take_pending_from, ReleasedModel};
use crate::model_watch_store::{load_store, merge_releases, save_store, WatchStore};

fn release(id: &str) -> ReleasedModel {
    ReleasedModel {
        id: id.into(),
        name: id.into(),
    }
}

#[test]
fn saved_pending_releases_survive_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("model-releases.json");
    let mut store = WatchStore::default();
    merge_releases(&mut store, 12, vec![release("openai/new")]).unwrap();
    save_store(&path, &store).unwrap();

    let restored = load_store(&path).unwrap().unwrap();
    assert_eq!(restored.cursor, 12);
    assert_eq!(restored.pending, vec![release("openai/new")]);
}

#[test]
fn pending_releases_replay_after_late_ui_mount_only_once() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("model-releases.json");
    let mut store = WatchStore::default();
    merge_releases(&mut store, 12, vec![release("openai/new")]).unwrap();
    save_store(&path, &store).unwrap();

    let first = tauri::async_runtime::block_on(take_pending_from(&path)).unwrap();
    let second = tauri::async_runtime::block_on(take_pending_from(&path)).unwrap();
    assert_eq!(first, vec![release("openai/new")]);
    assert!(second.is_empty());
    assert_eq!(load_store(&path).unwrap().unwrap().cursor, 12);
}

#[test]
fn repeated_model_ids_never_queue_twice() {
    let mut store = WatchStore::default();
    merge_releases(&mut store, 12, vec![release("openai/new")]).unwrap();
    merge_releases(&mut store, 13, vec![release("openai/new")]).unwrap();
    assert_eq!(store.pending, vec![release("openai/new")]);
    assert_eq!(store.cursor, 13);
}

#[test]
fn backwards_cursor_does_not_replay_releases() {
    let mut store = WatchStore::default();
    merge_releases(&mut store, 12, vec![release("openai/new")]).unwrap();
    assert!(merge_releases(&mut store, 11, vec![release("openai/older")]).is_err());
    assert_eq!(store.pending, vec![release("openai/new")]);
}

#[test]
fn corrupt_state_never_silently_reseeds() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("model-releases.json");
    std::fs::write(&path, b"not json").unwrap();
    assert!(load_store(&path).is_err());
}
