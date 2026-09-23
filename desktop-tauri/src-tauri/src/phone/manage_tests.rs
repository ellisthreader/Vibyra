#[cfg(unix)]
use super::requests::TerminalRequests;
use super::{
    backend::DesktopBackend,
    manage::MANAGE_OFF,
    vault::Vault,
    workspace::{DesktopProject, SharedWorkspace},
};
use serde_json::json;
#[cfg(unix)]
use serde_json::Value;
use std::sync::{atomic::AtomicBool, Arc};
#[cfg(unix)]
use std::{
    thread,
    time::{Duration, Instant},
};
#[cfg(unix)]
use vibyra_core::pty::LaunchSpec;
use vibyra_core::pty::{FlushConfig, OutputSink, PtyManager};
use vibyra_host::Backend;

pub(super) struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}

fn published() -> SharedWorkspace {
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "p-1".into(),
            name: "Vibyra".into(),
            path: "~/Desktop/Vibyra".into(),
        }],
        vec![],
        None,
    );
    workspace
}

/// Stands in for the window: answers every request the way the grid would,
/// and counts how many it was asked so a retry can be seen not to start twice.
#[cfg(unix)]
pub(super) fn window(
    requests: Arc<TerminalRequests>,
    answer: impl Fn(&Value) -> Result<Value, String> + Send + 'static,
) -> Arc<std::sync::atomic::AtomicUsize> {
    let asked = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let count = asked.clone();
    thread::spawn(move || loop {
        for request in requests.pending() {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let id = request["id"].as_str().unwrap();
            requests.reply(id, answer(&request));
        }
        thread::sleep(Duration::from_millis(10));
    });
    asked
}

#[test]
fn starting_and_closing_are_behind_the_typing_switch() {
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let backend = DesktopBackend::new(
        manager,
        published(),
        Arc::new(AtomicBool::new(false)),
        Vault::empty(),
        Default::default(),
    )
    .unwrap();
    let state = backend.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(state["capabilities"]["canManage"], false);
    let create = json!({"projectId":"p-1","kind":"shell","title":"Terminal","requestId":"r-1"});
    assert_eq!(
        backend.handle("phone", "session.create", create),
        Err(MANAGE_OFF.into())
    );
}

#[cfg(unix)]
#[test]
fn a_phone_starts_a_terminal_through_the_window_and_closes_it_the_same_way() {
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let requests = Arc::new(TerminalRequests::default());
    let backend = DesktopBackend::new(
        manager.clone(),
        published(),
        Arc::new(AtomicBool::new(true)),
        Vault::empty(),
        requests.clone(),
    )
    .unwrap();
    assert_eq!(
        backend.handle("phone", "host.state", json!({})).unwrap()["capabilities"]["canManage"],
        true
    );
    // The window answers a start by launching a real pane, as its grid would.
    let spawner = manager.clone();
    let asked = window(requests.clone(), move |request| {
        if request["action"] == "close" {
            let id = request["paneId"].as_u64().unwrap();
            spawner.remove(id).map_err(|e| e.to_string())?;
            return Ok(json!({"ok":true}));
        }
        assert_eq!(request["projectId"], "p-1");
        assert_eq!(request["title"], "From the phone");
        let spec = LaunchSpec {
            program: "/bin/sh".into(),
            args: vec!["-c".into(), "read answer".into()],
            env: vec![],
            env_remove: vec![],
            cwd: None,
            rows: 30,
            cols: 100,
        };
        let info = spawner
            .create_session("shell", "From the phone", &spec)
            .map_err(|e| e.to_string())?;
        Ok(json!({"paneId":info.id}))
    });
    let create =
        json!({"projectId":"p-1","kind":"shell","title":"From the phone","requestId":"r-1"});
    let session = backend
        .handle("phone", "session.create", create.clone())
        .unwrap();
    assert_eq!(session["projectId"], "p-1");
    assert_eq!(session["title"], "From the phone");
    assert_eq!(session["status"], "running");
    assert_eq!(manager.list().len(), 1);
    // A retry after an uncertain send finds the same terminal, not a second.
    let again = backend.handle("phone", "session.create", create).unwrap();
    assert_eq!(again["id"], session["id"]);
    assert_eq!(asked.load(std::sync::atomic::Ordering::SeqCst), 1);
    assert_eq!(manager.list().len(), 1);
    // A project the window does not list cannot be started in.
    assert!(backend
        .handle(
            "phone",
            "session.create",
            json!({"projectId":"p-gone","kind":"shell","title":"x","requestId":"r-2"})
        )
        .is_err());
    // Closing goes through the window too, so the Mac's pane goes with it.
    let id = session["id"].clone();
    let closed = backend
        .handle("phone", "session.stop", json!({"sessionId":id}))
        .unwrap();
    assert_eq!(closed["ok"], true);
    let deadline = Instant::now() + Duration::from_secs(2);
    while !manager.list().is_empty() {
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(10));
    }
    assert!(backend
        .handle("phone", "session.stop", json!({"sessionId":id}))
        .is_err());
    manager.shutdown();
}
