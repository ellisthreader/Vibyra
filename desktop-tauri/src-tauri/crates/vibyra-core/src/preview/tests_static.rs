use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tempfile::{tempdir, TempDir};

use super::{inspect_project, PreviewManager, PreviewPhase};

fn start_site(index: &str) -> (TempDir, Arc<PreviewManager>, u16) {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("index.html"), index).unwrap();
    let inspection = inspect_project(dir.path().to_str().unwrap()).unwrap();
    let manager = PreviewManager::new();
    let status = manager
        .start(dir.path().to_str().unwrap(), &inspection.targets[0].id)
        .unwrap();
    assert_eq!(inspection.targets[0].framework, "Static website");
    assert_eq!(status.phase, PreviewPhase::Running);
    let port = status
        .url
        .unwrap()
        .trim_end_matches('/')
        .rsplit(':')
        .next()
        .unwrap()
        .parse()
        .unwrap();
    (dir, manager, port)
}

fn request(port: u16, parts: &[&[u8]]) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    for part in parts {
        stream.write_all(part).unwrap();
        if parts.len() > 1 {
            thread::sleep(Duration::from_millis(30));
        }
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    response
}

#[test]
fn detects_and_serves_a_static_site() {
    let (_dir, _manager, port) = start_site("<h1>Vibyra preview</h1>");
    let response = request(port, &[b"GET / HTTP/1.1\r\nHost: localhost\r\n\r\n"]);
    assert!(response.contains("Vibyra preview"));
}

#[test]
fn accepts_a_request_head_split_across_packets() {
    let (_dir, _manager, port) = start_site("fragmented");
    let response = request(port, &[b"GET / HTTP/1.1\r\n", b"Host: localhost\r\n\r\n"]);
    assert!(response.starts_with("HTTP/1.1 200 OK"));
    assert!(response.ends_with("fragmented"));
}

#[test]
fn traversal_never_reaches_outside_static_root() {
    let (_dir, _manager, port) = start_site("inside");
    let response = request(
        port,
        &[b"GET /%2e%2e/etc/passwd HTTP/1.1\r\nHost: localhost\r\n\r\n"],
    );
    assert!(response.starts_with("HTTP/1.1 404"));
}

#[test]
fn static_media_supports_bounded_byte_ranges() {
    let (dir, _manager, port) = start_site("index");
    fs::write(dir.path().join("clip.mp4"), b"0123456789").unwrap();
    let response = request(
        port,
        &[b"GET /clip.mp4 HTTP/1.1\r\nHost: localhost\r\nRange: bytes=2-5\r\n\r\n"],
    );
    assert!(response.starts_with("HTTP/1.1 206 Partial Content"));
    assert!(response.contains("Content-Range: bytes 2-5/10"));
    assert!(response.ends_with("2345"));
}

#[test]
fn multiple_static_targets_run_concurrently() {
    let dir = tempdir().unwrap();
    let app = dir.path().join("app");
    fs::create_dir_all(&app).unwrap();
    fs::write(dir.path().join("index.html"), "root app").unwrap();
    fs::write(app.join("index.html"), "nested app").unwrap();
    let inspection = inspect_project(dir.path().to_str().unwrap()).unwrap();
    let root_target = inspection
        .targets
        .iter()
        .find(|target| target.relative_root == ".")
        .unwrap();
    let nested_target = inspection
        .targets
        .iter()
        .find(|target| target.relative_root == "app")
        .unwrap();
    let manager = PreviewManager::new();
    let first = manager
        .start(dir.path().to_str().unwrap(), &root_target.id)
        .unwrap();
    let second = manager
        .start(dir.path().to_str().unwrap(), &nested_target.id)
        .unwrap();

    assert_eq!(first.phase, PreviewPhase::Running);
    assert_eq!(second.phase, PreviewPhase::Running);
    assert_ne!(first.url, second.url);
    assert_eq!(
        manager
            .status(dir.path().to_str().unwrap(), &root_target.id)
            .unwrap()
            .phase,
        PreviewPhase::Running
    );
}

#[test]
fn a_deleted_project_can_still_stop_its_tracked_preview() {
    let (dir, manager, _port) = start_site("temporary");
    let root = dir.path().to_string_lossy().into_owned();
    let target = inspect_project(&root).unwrap().targets[0].id.clone();
    drop(dir);

    assert_eq!(
        manager.stop(&root, &target).unwrap().phase,
        PreviewPhase::Stopped
    );
}
