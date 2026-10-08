use super::{
    backend::DesktopBackend,
    manage::MANAGE_OFF,
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
fn explicit_phone_permissions_are_validated_and_typing_gated() {
    let requests = Arc::new(TerminalRequests::default());
    let typing = Arc::new(AtomicBool::new(true));
    let backend = DesktopBackend::new(
        PtyManager::new(Arc::new(Sink), FlushConfig::default()),
        published(),
        typing.clone(),
        Vault::empty(),
        requests.clone(),
    )
    .unwrap();
    window(requests, |request| {
        if request["action"] == "models" {
            return Ok(json!({"models":[],"permissionModes":["standard","full"]}));
        }
        assert!(request["permissionMode"] == "full" || request["permissionMode"] == "standard");
        assert_eq!(request["safeMode"], true);
        Ok(json!({"paneId":42}))
    });
    let catalogue = backend
        .handle("phone", "session.models", json!({}))
        .unwrap();
    assert_eq!(catalogue["permissionsVersion"], 1);
    assert_eq!(catalogue["permissionModes"], json!(["standard", "full"]));
    assert_eq!(
        catalogue["runnerKinds"],
        json!([
            "codex", "claude", "gemini", "qwen", "aider", "opencode", "copilot", "amp", "crush",
            "continue"
        ])
    );
    let mut create = json!({"projectId":"p-1","kind":"codex","title":"Work",
        "requestId":"full","safeMode":true,"permissionMode":"full"});
    assert!(backend
        .handle("phone", "session.create", create.clone())
        .is_ok());
    for kind in [
        "gemini", "qwen", "aider", "opencode", "copilot", "amp", "crush", "continue",
    ] {
        let mut model_launch = create.clone();
        model_launch["kind"] = json!(kind);
        model_launch["model"] = json!("company/exact-model");
        model_launch["permissionMode"] = json!("standard");
        model_launch["requestId"] = json!(format!("runner-{kind}"));
        assert!(backend
            .handle("phone", "session.create", model_launch.clone())
            .is_ok());
        model_launch.as_object_mut().unwrap().remove("model");
        assert!(backend
            .handle("phone", "session.create", model_launch)
            .unwrap_err()
            .contains("available model"));
    }
    create["requestId"] = json!("standard");
    create["permissionMode"] = json!("standard");
    assert!(backend
        .handle("phone", "session.create", create.clone())
        .is_ok());
    create["permissionMode"] = json!("everything");
    assert!(backend
        .handle("phone", "session.create", create.clone())
        .unwrap_err()
        .contains("Standard or Full"));
    create["permissionMode"] = json!("full");
    create["kind"] = json!("shell");
    assert!(backend
        .handle("phone", "session.create", create.clone())
        .unwrap_err()
        .contains("AI terminal"));
    create["kind"] = json!("codex");
    typing.store(false, Ordering::SeqCst);
    assert_eq!(
        backend.handle("phone", "session.create", create),
        Err(MANAGE_OFF.into())
    );
}
