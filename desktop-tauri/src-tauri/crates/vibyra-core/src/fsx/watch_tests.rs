use super::*;
use std::sync::mpsc;
use std::time::Duration;

#[test]
fn filters_build_directories() {
    assert!(ignored(Path::new("/repo/node_modules/pkg/index.js")));
    assert!(ignored(Path::new("/repo/vendor/composer/autoload.php")));
    assert!(ignored(Path::new("/repo/.vibyra-agent/runs/latest.txt")));
    assert!(ignored(Path::new("/repo/target/debug/app")));
    assert!(ignored(Path::new("/repo/.git/objects/ab")));
    assert!(!ignored(Path::new("/repo/src/main.rs")));
    assert!(!ignored(Path::new("/repo/targeted/file.txt")));
}

#[test]
fn reports_created_files() {
    let tmp = tempfile::tempdir().unwrap();
    let (tx, rx) = mpsc::channel();
    let watcher = WorkspaceWatcher::start(tmp.path().to_str().unwrap(), move |changes| {
        let _ = tx.send(changes);
    })
    .unwrap();
    std::thread::sleep(Duration::from_millis(100));
    std::fs::write(tmp.path().join("new-file.txt"), "hello").unwrap();
    let changes = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(changes.iter().any(|c| c.path.contains("new-file.txt")));
    drop(watcher);
}

#[test]
fn follows_new_and_renamed_source_directories_without_ignored_events() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(tmp.path().join("node_modules/pkg/nested")).unwrap();
    let (tx, rx) = mpsc::channel();
    let watcher = WorkspaceWatcher::start(tmp.path().to_str().unwrap(), move |changes| {
        let _ = tx.send(changes);
    })
    .unwrap();
    std::fs::write(
        tmp.path().join("node_modules/pkg/nested/file.js"),
        "ignored",
    )
    .unwrap();
    assert!(rx.recv_timeout(Duration::from_millis(650)).is_err());
    std::fs::create_dir_all(tmp.path().join("src/deep")).unwrap();
    rx.recv_timeout(Duration::from_secs(5)).unwrap();
    std::fs::write(tmp.path().join("src/deep/first.rs"), "first").unwrap();
    wait_for(&rx, "first.rs");
    std::fs::rename(tmp.path().join("src"), tmp.path().join("renamed")).unwrap();
    rx.recv_timeout(Duration::from_secs(5)).unwrap();
    std::fs::write(tmp.path().join("renamed/deep/second.rs"), "second").unwrap();
    wait_for(&rx, "second.rs");
    drop(watcher);
    while rx.try_recv().is_ok() {}
    std::fs::write(tmp.path().join("renamed/deep/after-drop.rs"), "gone").unwrap();
    assert!(rx.recv_timeout(Duration::from_millis(650)).is_err());
}

fn wait_for(rx: &mpsc::Receiver<Vec<FsChange>>, suffix: &str) {
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let changes = rx
            .recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))
            .unwrap();
        assert!(changes
            .iter()
            .all(|change| !change.path.contains("node_modules")));
        if changes.iter().any(|change| change.path.ends_with(suffix)) {
            return;
        }
    }
}
