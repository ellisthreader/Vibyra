use super::address::connection_address as private_address;
#[cfg(unix)]
use super::{
    backend::DesktopBackend,
    vault::Vault,
    workspace::{DesktopPane, DesktopProject, SharedWorkspace},
};
#[cfg(unix)]
use serde_json::json;
#[cfg(unix)]
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
#[cfg(unix)]
use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
#[cfg(unix)]
use vibyra_host::Backend;

#[cfg(unix)]
struct Sink;
#[cfg(unix)]
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
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "p-1".into(),
            name: "Vibyra".into(),
            path: "~/Desktop/Vibyra".into(),
        }],
        vec![DesktopPane {
            id: original.id,
            project_id: "p-1".into(),
            title: "Landing page".into(),
        }],
        None,
    );
    let backend = DesktopBackend::new(
        manager.clone(),
        workspace.clone(),
        Default::default(),
        Vault::empty(),
        Default::default(),
    )
    .unwrap();
    let state = backend.handle("phone", "host.state", json!({})).unwrap();
    // The phone lists the Mac's own projects, and each terminal under the one
    // the desktop is showing it in — under the name the desktop shows.
    assert_eq!(state["projects"][0]["name"], "Vibyra");
    assert_eq!(state["projects"][0]["path"], "~/Desktop/Vibyra");
    assert_eq!(state["projects"][1], json!(null), "no empty spare folder");
    assert_eq!(state["sessions"][0]["projectId"], "p-1");
    assert_eq!(state["sessions"][0]["title"], "Landing page");
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
    // A phone never sets this Mac's grid: shrinking a pane to a phone's width
    // broke the display the person was working in. The phone draws the Mac's
    // grid at its own zoom, and an older phone that still asks is told so.
    let asked = backend.handle(
        "phone",
        "session.resize",
        json!({"sessionId":id,"cols":46,"rows":32}),
    );
    assert!(asked.is_err(), "a phone must not resize a Mac's pane");
    assert_eq!(
        manager.list().first().map(|s| (s.cols, s.rows)),
        Some((100, 30))
    );
    // The phone renders this Mac's grid rather than its own width, so the
    // snapshot has to say what that grid is and a later resize has to reach it.
    assert_eq!(snapshot["cols"].as_u64(), Some(100));
    assert_eq!(snapshot["rows"].as_u64(), Some(30));
    manager.resize(original.id, 44, 132).unwrap();
    let mut resized = false;
    while Instant::now() < deadline {
        if let Ok(event) = events.recv_timeout(Duration::from_millis(250)) {
            if event["event"] == "terminal.size" && event["data"]["cols"] == 132 {
                assert_eq!(event["data"]["rows"], 44);
                resized = true;
                break;
            }
        }
    }
    assert!(resized, "a pane resized on the Mac must reach the phone");
    backend.disconnected("phone");
    assert_eq!(manager.list().len(), 1);
    let restarted = DesktopBackend::new(
        manager.clone(),
        workspace,
        Default::default(),
        Vault::empty(),
        Default::default(),
    )
    .unwrap();
    assert!(restarted
        .handle("phone", "session.snapshot", json!({"sessionId":id}))
        .is_err());
    manager.shutdown();
}
