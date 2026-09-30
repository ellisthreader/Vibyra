//! Saved-terminal identity, local typing and project ownership.

use super::{backend::DesktopBackend, saved::SavedPane};
use crate::phone::{
    manage_tests::{published, window, Sink},
    requests::TerminalRequests,
    vault::Vault,
};
use serde_json::json;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use vibyra_core::pty::{FlushConfig, PtyManager};
use vibyra_host::Backend;
#[test]
fn saved_pane_lists_without_a_pty_and_resumes_only_with_typing_permission() {
    let workspace = published();
    workspace.write().saved.push(SavedPane {
        id: -1,
        project_id: "p-1".into(),
        title: "HKE terminal".into(),
        kind: "shell".into(),
    });
    let typing = Arc::new(AtomicBool::new(false));
    let requests = Arc::new(TerminalRequests::default());
    let backend = DesktopBackend::new(
        PtyManager::new(Arc::new(Sink), FlushConfig::default()),
        workspace.clone(),
        typing.clone(),
        Vault::empty(),
        requests.clone(),
    )
    .unwrap();
    let state = backend.handle("phone", "host.state", json!({})).unwrap();
    let saved = &state["sessions"][0];
    assert_eq!(saved["saved"], true);
    assert_eq!(saved["projectId"], "p-1");
    let params = json!({"sessionId":saved["id"]});
    assert!(backend
        .handle("phone", "session.resumeSaved", params.clone())
        .unwrap_err()
        .contains("Typing"));
    typing.store(true, Ordering::SeqCst);
    window(requests, |request| {
        assert_eq!(request["action"], "resumeSaved");
        assert_eq!(request["paneId"], -1);
        Ok(json!({"paneId":42}))
    });
    let resumed = backend
        .handle("phone", "session.resumeSaved", params)
        .unwrap();
    assert_eq!(resumed["id"], backend.id(42));
    assert_eq!(resumed["projectId"], "p-1");
    workspace.write().publish(vec![], vec![], None);
    assert!(backend
        .handle(
            "phone",
            "session.resumeSaved",
            json!({"sessionId":saved["id"]})
        )
        .unwrap_err()
        .contains("project is no longer open"));
    assert!(backend
        .handle(
            "phone",
            "session.resumeSaved",
            json!({"sessionId":"old-saved-1"})
        )
        .is_err());
}
