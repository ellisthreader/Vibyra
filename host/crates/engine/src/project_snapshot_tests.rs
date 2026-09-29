use crate::Engine;
use std::{
    fs,
    os::unix::fs::{symlink, MetadataExt},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

fn identity(path: &Path) -> (u64, u64) {
    let info = fs::metadata(path).unwrap();
    (info.dev(), info.ino())
}

fn engine(root: &Path, state: &Path) -> Engine {
    Engine::new_read_only(state.to_owned(), "Approved".into(), root.to_owned()).unwrap()
}

fn selected(paths: &[&str]) -> Vec<String> {
    paths.iter().map(|path| (*path).into()).collect()
}

#[test]
fn copies_only_exact_files_and_fingerprint_changes_with_content() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project");
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("src/calc.sh"), b"echo 4\n").unwrap();
    fs::write(root.join("test.sh"), b"#!/bin/sh\n").unwrap();
    fs::write(root.join(".env"), b"SECRET=fixture\n").unwrap();
    let engine = engine(&root, &temp.path().join("state"));
    let first = engine
        .snapshot_approved_files(identity(&root), &selected(&["test.sh", "src/calc.sh"]))
        .unwrap();
    assert_eq!(
        first
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>(),
        ["src/calc.sh", "test.sh"]
    );
    assert_eq!(first.files[0].content, b"echo 4\n");
    // Same canonical manifest as desktop-tauri/scripts/agent-vm-snapshot.py.
    assert_eq!(
        first.fingerprint,
        "96887fe723dce199546f64a739c1d4ddbe870b24c2ea61d11a6ad2c2d8ac86c9"
    );
    assert!(!first
        .files
        .iter()
        .any(|file| file.content.windows(6).any(|part| part == b"SECRET")));
    let reordered = engine
        .snapshot_approved_files(identity(&root), &selected(&["src/calc.sh", "test.sh"]))
        .unwrap();
    assert_eq!(first.fingerprint, reordered.fingerprint);
    fs::write(root.join("src/calc.sh"), b"echo 5\n").unwrap();
    let changed = engine
        .snapshot_approved_files(identity(&root), &selected(&["src/calc.sh", "test.sh"]))
        .unwrap();
    assert_ne!(first.fingerprint, changed.fingerprint);
}

#[test]
fn rejects_symlink_hardlink_and_private_paths() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project");
    fs::create_dir(&root).unwrap();
    let outside = temp.path().join("secret");
    fs::write(&outside, b"private\n").unwrap();
    symlink(&outside, root.join("link")).unwrap();
    symlink(temp.path(), root.join("linked-dir")).unwrap();
    fs::hard_link(&outside, root.join("hardlink")).unwrap();
    let _socket = std::os::unix::net::UnixListener::bind(root.join("socket")).unwrap();
    let engine = engine(&root, &temp.path().join("state"));
    for path in [
        "link",
        "linked-dir/secret",
        "hardlink",
        "socket",
        "../secret",
        ".env",
        "src/.secret",
        "node_modules/a.js",
        "vendor/a",
        "a//b",
        "/secret",
    ] {
        assert!(
            engine
                .snapshot_approved_files(identity(&root), &selected(&[path]))
                .is_err(),
            "{path}"
        );
    }
    assert!(engine
        .snapshot_approved_files(identity(&root), &selected(&["link", "link"]))
        .is_err());
}

#[test]
fn rejects_replaced_root_and_file_size_limit() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("small"), b"approved\n").unwrap();
    fs::write(root.join("large"), vec![b'x'; 256 * 1024 + 1]).unwrap();
    let expected = identity(&root);
    let engine = engine(&root, &temp.path().join("state"));
    assert!(engine
        .snapshot_approved_files(expected, &selected(&["large"]))
        .is_err());
    let mut paths = Vec::new();
    for index in 0..33 {
        let name = format!("part-{index}");
        fs::write(root.join(&name), vec![b'x'; 256 * 1024]).unwrap();
        paths.push(name);
    }
    assert!(engine.snapshot_approved_files(expected, &paths).is_err());
    fs::rename(&root, temp.path().join("old-project")).unwrap();
    fs::create_dir(&root).unwrap();
    fs::write(root.join("small"), b"replacement\n").unwrap();
    assert!(engine
        .snapshot_approved_files(expected, &selected(&["small"]))
        .is_err());
}

#[test]
fn rejects_unapproved_writable_engine() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("file"), b"approved\n").unwrap();
    let engine = Engine::new(
        temp.path().join("state"),
        vec![("Project".into(), root.clone())],
    )
    .unwrap();
    assert!(engine
        .snapshot_approved_files(identity(&root), &selected(&["file"]))
        .is_err());
}

#[test]
fn racing_symlink_never_copies_outside_content() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project");
    fs::create_dir(&root).unwrap();
    let outside = temp.path().join("secret");
    fs::write(&outside, b"private\n").unwrap();
    fs::write(root.join("victim"), b"approved\n").unwrap();
    let expected = identity(&root);
    let engine = engine(&root, &temp.path().join("state"));
    let stop = Arc::new(AtomicBool::new(false));
    let worker_stop = Arc::clone(&stop);
    let worker = std::thread::spawn(move || {
        let mut link = false;
        while !worker_stop.load(Ordering::Relaxed) {
            let next = root.join("next");
            if link {
                symlink(&outside, &next).unwrap();
            } else {
                fs::write(&next, b"approved\n").unwrap();
            }
            fs::rename(&next, root.join("victim")).unwrap();
            link = !link;
        }
    });
    for _ in 0..300 {
        if let Ok(snapshot) = engine.snapshot_approved_files(expected, &selected(&["victim"])) {
            assert_eq!(snapshot.files[0].content, b"approved\n");
        }
    }
    stop.store(true, Ordering::Relaxed);
    worker.join().unwrap();
}
