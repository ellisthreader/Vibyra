#![cfg(target_os = "macos")]
use super::preview_grants::PreviewGrants;
use super::preview_service::PreviewService;
use super::workspace::{DesktopProject, SharedWorkspace};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use vibyra_core::preview::PreviewManager;

#[test]
#[ignore = "Live macOS listener discovery shares the test process with parallel fixtures"]
fn paired_phone_needs_separate_opt_in_and_typing_for_discovered_site() {
    let temp = tempfile::tempdir().unwrap();
    let grants = Arc::new(PreviewGrants::load(temp.path().join("grants")).unwrap());
    grants.set_account(Some("user:alice")).unwrap();
    let workspace = SharedWorkspace::default();
    let root = std::env::current_dir().unwrap();
    workspace.write().publish(
        vec![DesktopProject {
            id: "site".into(),
            name: "Site".into(),
            path: root.to_string_lossy().into(),
        }],
        Vec::new(),
        None,
    );
    let typing = Arc::new(AtomicBool::new(true));
    let service = PreviewService::new_with_typing(
        PreviewManager::new(),
        grants.clone(),
        workspace,
        typing.clone(),
    );
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    listener.set_nonblocking(true).unwrap();
    let live = Arc::new(AtomicBool::new(true));
    let running = live.clone();
    let worker = std::thread::spawn(move || {
        while running.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((mut socket, _)) => {
                    let mut request = [0u8; 1024];
                    let _ = socket.read(&mut request);
                    let _ = socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 13\r\nConnection: close\r\n\r\n<h1>Site</h1>");
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(5))
                }
                Err(_) => break,
            }
        }
    });
    assert!(service.list("phone")["targets"]
        .as_array()
        .unwrap()
        .is_empty());
    let stale = TcpListener::bind("127.0.0.1:0").unwrap();
    let stale_port = stale.local_addr().unwrap().port();
    grants
        .grant(
            "phone",
            "site",
            &root,
            &format!("attached-port:{stale_port}"),
        )
        .unwrap();
    drop(stale);
    grants.set_automatic("phone", true).unwrap();
    let list = service.list("phone");
    let target = list["targets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|target| target["targetId"] == format!("auto-port:{port}"))
        .expect("project-owned local site should be discovered");
    assert_eq!(target["running"], true);
    let id = target["grantId"].as_str().unwrap();
    let repeated = service.list("phone");
    assert!(
        repeated["targets"]
            .as_array()
            .unwrap()
            .iter()
            .any(|target| target["grantId"] == id
                && target["targetId"] == format!("auto-port:{port}"))
    );
    assert_eq!(service.start("phone", id).unwrap()["phase"], "running");
    assert!(service.open("phone", id).unwrap()["generation"].is_string());
    typing.store(false, Ordering::SeqCst);
    assert!(service.start("phone", id).is_err());
    typing.store(true, Ordering::SeqCst);
    grants.set_automatic("phone", false).unwrap();
    assert!(service.open("phone", id).is_err());
    grants.set_automatic("phone", true).unwrap();
    live.store(false, Ordering::SeqCst);
    worker.join().unwrap();
    assert!(service.start("phone", id).is_err());
}
