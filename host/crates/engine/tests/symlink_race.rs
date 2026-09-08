#![cfg(unix)]
mod support;
use serde_json::json;
use std::{
    os::unix::fs::symlink,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

#[test]
fn racing_symlink_replacement_cannot_read_unapproved_file() {
    let host = support::Harness::new();
    std::fs::write(host.path.join("safe"), "approved").unwrap();
    std::fs::write(host.directory.path().join("secret"), "outside").unwrap();
    symlink("safe", host.path.join("link")).unwrap();
    let live = Arc::new(AtomicBool::new(true));
    let worker_live = live.clone();
    let root = host.path.clone();
    let worker = std::thread::spawn(move || {
        let mut outside = false;
        while worker_live.load(Ordering::Relaxed) {
            let temporary = root.join("next-link");
            symlink(if outside { "../secret" } else { "safe" }, &temporary).unwrap();
            std::fs::rename(temporary, root.join("link")).unwrap();
            outside = !outside;
        }
    });
    let mut reads = Vec::new();
    for _ in 0..300 {
        if let Ok(result) = host.engine.handle(
            "phone-a",
            "project.read",
            json!({"projectId":host.project,"path":"link"}),
        ) {
            reads.push(result["content"].clone());
        }
    }
    live.store(false, Ordering::Relaxed);
    worker.join().unwrap();
    assert!(!reads.is_empty());
    assert!(reads.iter().all(|content| content == "approved"));
}
