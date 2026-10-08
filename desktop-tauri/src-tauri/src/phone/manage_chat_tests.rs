//! A shared chat is a terminal on the phone only while the Mac's grid shows
//! it, and is closed from the phone the way the Mac's own button closes it.
use super::manage_tests::{window, Sink};
use super::{
    backend::DesktopBackend, requests::TerminalRequests, shared_backend::SharedBackend,
    vault::Vault, workspace::SharedWorkspace,
};
use serde_json::json;
use std::sync::{atomic::AtomicBool, Arc};
use vibyra_core::pty::{FlushConfig, PtyManager};
use vibyra_host::Backend;

#[test]
fn only_the_chats_the_mac_is_showing_are_served_as_terminals() {
    let (_dir, chats, session) = crate::shared_chats::fixture::fixture();
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let workspace = SharedWorkspace::default();
    let typing = Arc::new(AtomicBool::new(true));
    let requests = Arc::new(TerminalRequests::default());
    let backend = SharedBackend {
        terminal: DesktopBackend::new(
            manager,
            workspace.clone(),
            typing.clone(),
            Vault::empty(),
            requests.clone(),
        )
        .unwrap(),
        chats: chats.clone(),
        typing,
    };
    let id = session["id"].as_str().unwrap().to_owned();
    // Before the window has said what it shows, every chat is served.
    let state = backend.handle("phone", "host.state", json!({})).unwrap();
    assert!(state["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["id"] == id));
    assert_eq!(state["capabilities"]["canManage"], true);
    // Closed on the Mac: no longer a terminal the phone lists.
    workspace.write().publish(vec![], vec![], Some(vec![]));
    let state = backend.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(state["sessions"], json!([]));
    assert_eq!(state["sessionCount"], 0);
    // Shown again: back.
    workspace
        .write()
        .publish(vec![], vec![], Some(vec![id.clone()]));
    let state = backend.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(state["sessions"][0]["id"], id);
    // Closing a shared chat from the phone is the window's to do, like its own
    // Close button; the engine's own refusal is not what the phone hears.
    let asked = window(requests, |request| {
        assert_eq!(request["action"], "close");
        assert!(request["conversationId"].is_string());
        Ok(json!({"ok":true}))
    });
    let closed = backend
        .handle("phone", "session.stop", json!({"sessionId":id}))
        .unwrap();
    assert_eq!(closed["ok"], true);
    assert_eq!(asked.load(std::sync::atomic::Ordering::SeqCst), 1);
}
