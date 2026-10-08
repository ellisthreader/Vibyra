//! Real queued request → native create service → PTY regression.
use super::{
    phone_effects::PhoneEffect, terminal_create_service::create_checked,
    terminal_launch::CreateTerminalRequest, terminal_prepare::LaunchContext,
};
use crate::phone::{workspace::DesktopProject, PhoneConnection};
use crate::test_shell;
use serde_json::json;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use vibyra_core::pty::{FlushConfig, OutputSink, PtyManager};
use vibyra_host::PreviewAccess;
struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}
struct Access(AtomicBool);
impl PreviewAccess for Access {
    fn permits(&self, permission: &str) -> bool {
        self.0.load(Ordering::SeqCst) && permission == "terminal:access"
    }
}
#[test]
fn queued_native_create_denies_revocation_wrong_scope_and_allows_exact_live_request() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap().to_owned();
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let phone = Arc::new(PhoneConnection::new(
        dir.path().join("phone"),
        manager.clone(),
    ));
    phone.lock().enable_test_terminal_effects();
    phone.lock().publish(
        vec![DesktopProject {
            id: "p".into(),
            name: "fixture".into(),
            path: root.clone(),
        }],
        vec![],
        None,
    );
    let requests = phone.lock().requests.clone();
    let (send, receive) = mpsc::channel();
    requests.attach(Box::new(move |value| {
        send.send(value["id"].as_str().unwrap().to_owned()).unwrap();
    }));
    let access = Arc::new(Access(AtomicBool::new(true)));
    let pending = requests.clone();
    let scope = access.clone();
    let worker = std::thread::spawn(move || {
        vibyra_host::with_rpc_access(scope, || {
            pending.ask(json!({"action":"create","kind":"shell","projectId":"p"}))
        })
    });
    let id = receive
        .recv_timeout(std::time::Duration::from_secs(2))
        .unwrap();
    assert!(PhoneEffect::capture_queued(
        phone.clone(),
        Some("wrong"),
        &["create"],
        Some("p"),
        None
    )
    .is_err());
    assert!(
        PhoneEffect::capture_queued(phone.clone(), Some(&id), &["close"], Some("p"), None).is_err()
    );
    assert!(PhoneEffect::capture_queued(
        phone.clone(),
        Some(&id),
        &["create"],
        Some("other"),
        None
    )
    .is_err());
    let effect = || {
        PhoneEffect::capture_queued(phone.clone(), Some(&id), &["create"], Some("p"), None).unwrap()
    };
    let context = || LaunchContext {
        default_shell: Some(test_shell::waiting().program),
        custom_agents: vec![],
        workspace_root: None,
        worktrees_root: dir.path().join("worktrees"),
    };
    let request = |cwd: &str| {
        serde_json::from_value::<CreateTerminalRequest>(json!({"agentId":"shell","cwd":cwd}))
            .unwrap()
    };
    let foreign = tempfile::tempdir().unwrap();
    assert!(create_checked(
        &manager,
        request(foreign.path().to_str().unwrap()),
        context(),
        effect()
    )
    .is_err());
    assert!(manager.list().is_empty());
    let admitted = effect();
    access.0.store(false, Ordering::SeqCst);
    assert!(create_checked(&manager, request(&root), context(), admitted).is_err());
    assert!(
        manager.list().is_empty(),
        "revocation before native effect spawns no PTY"
    );
    access.0.store(true, Ordering::SeqCst);
    let before_spawn = access.clone();
    let denied = vibyra_core::preview::with_launch_authorization(
        Arc::new(move |_| {
            before_spawn.0.store(false, Ordering::SeqCst);
            Ok(())
        }),
        || create_checked(&manager, request(&root), context(), effect()),
    );
    assert!(denied.is_err());
    assert!(
        manager.list().is_empty(),
        "revocation at the actual spawn fence creates no PTY"
    );
    access.0.store(true, Ordering::SeqCst);
    let started = create_checked(&manager, request(&root), context(), effect()).unwrap();
    assert_eq!(manager.list().len(), 1);
    manager.remove(started.id).unwrap();
    let expired = effect();
    requests.reply(&id, Ok(json!({"paneId":started.id})));
    worker.join().unwrap().unwrap();
    assert!(create_checked(&manager, request(&root), context(), expired).is_err());
    assert!(
        manager.list().is_empty(),
        "reply consumes the request and cannot spawn again"
    );
}
