use super::{
    address::connection_address as private_address, backend::DesktopBackend, PhoneConnection,
};
use serde_json::json;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
use vibyra_host::Backend;

struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}
#[test]
fn public_and_wildcard_addresses_are_rejected() {
    for ip in ["0.0.0.0", "8.8.8.8", "example.com", "192.168.1.2:80"] {
        assert!(private_address(ip).is_err());
    }
    for ip in ["192.168.1.2", "10.0.0.2", "100.100.0.2", "127.0.0.1"] {
        assert!(private_address(ip).is_ok());
    }
}
#[cfg(unix)]
#[test]
fn existing_desktop_pty_is_visible_and_remote_mutations_are_rejected() {
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let spec = LaunchSpec {
        program: "/bin/sh".into(),
        args: vec![
            "-c".into(),
            "printf 'PHONE_EXISTING_TERMINAL'; read answer; printf '\\n%s' \"$answer\"".into(),
        ],
        env: vec![],
        env_remove: vec![],
        cwd: None,
        rows: 30,
        cols: 100,
    };
    let original = manager
        .create_session("shell", "Existing chat", &spec)
        .unwrap();
    let backend = DesktopBackend::new(manager.clone()).unwrap();
    let state = backend.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(state["sessions"][0]["title"], "Existing chat");
    let id = state["sessions"][0]["id"].as_str().unwrap();
    let events = backend.subscribe();
    let deadline = Instant::now() + Duration::from_secs(5);
    let snapshot = loop {
        let s = backend
            .handle("phone", "session.snapshot", json!({"sessionId":id}))
            .unwrap();
        if s["output"]
            .as_str()
            .unwrap()
            .contains("PHONE_EXISTING_TERMINAL")
        {
            break s;
        }
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(20));
    };
    assert_eq!(
        snapshot["offset"].as_u64().unwrap(),
        snapshot["output"].as_str().unwrap().len() as u64
    );
    for method in [
        "session.claim",
        "session.input",
        "session.resize",
        "session.stop",
        "session.create",
        "project.read",
        "project.files",
        "preview.fetch",
    ] {
        assert!(backend
            .handle(
                "phone",
                method,
                json!({"sessionId":id,"data":"touch /tmp/unsafe"})
            )
            .is_err());
    }
    manager
        .write_input(original.id, b"DESKTOP_STILL_CONTROLS\n")
        .unwrap();
    let mut found = false;
    while Instant::now() < deadline {
        if let Ok(event) = events.recv_timeout(Duration::from_millis(250)) {
            if event["data"]["output"]
                .as_str()
                .is_some_and(|s| s.contains("DESKTOP_STILL_CONTROLS"))
            {
                found = true;
                break;
            }
        }
    }
    assert!(found, "live desktop output must stream to the phone");
    backend.disconnected("phone");
    assert_eq!(manager.list().len(), 1);
    let restarted = DesktopBackend::new(manager.clone()).unwrap();
    assert!(restarted
        .handle("phone", "session.snapshot", json!({"sessionId":id}))
        .is_err());
    manager.shutdown();
}

#[test]
fn the_switch_persists_on_its_own_and_no_address_is_stored() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("phone");
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let phone = PhoneConnection::new(path.clone(), manager.clone());
    {
        let mut phone = phone.lock();
        assert_eq!(phone.status()["enabled"], json!(false));
        // Enabling can still fail on a machine with no usable network; the
        // switch stays on either way so the watcher can bind later.
        let _ = phone.enable(manager.clone());
        assert_eq!(phone.status()["enabled"], json!(true));
    }
    let saved: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path.join("connection.json")).unwrap()).unwrap();
    assert_eq!(saved, json!({"enabled": true}));
    assert_eq!(
        PhoneConnection::new(path.clone(), manager.clone())
            .lock()
            .status()["enabled"],
        json!(true)
    );
    {
        let mut phone = phone.lock();
        phone.disable().unwrap();
        assert_eq!(phone.status()["enabled"], json!(false));
        assert_eq!(phone.status()["discoverable"], json!(false));
        assert_eq!(phone.address(), "");
        // A connection nobody asked for is never started by the watcher.
        phone.refresh(manager.clone());
        assert_eq!(phone.status()["discoverable"], json!(false));
    }
    assert!(PhoneConnection::new(path, manager.clone())
        .lock()
        .host()
        .is_err());
    manager.shutdown();
}
