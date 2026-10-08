//! Live consent checks do no native inventory or filesystem I/O.
use super::*;
use crate::phone::workspace::DesktopProject;
fn fixture() -> (
    tempfile::TempDir,
    PreviewGrants,
    DesktopWorkspace,
    WindowConsent,
) {
    let temp = tempfile::tempdir().unwrap();
    let grants = PreviewGrants::load(temp.path().join("state")).unwrap();
    *grants.account.lock() = Some("owner".into());
    let root = temp.path().join("project");
    grants.grants.lock().push(Grant {
        id: "first-approval".into(),
        account_id: "owner".into(),
        device_id: "phone".into(),
        project_id: "project".into(),
        source_root: root.clone(),
        canonical_root: root.clone(),
        target_id: "native-window:8877:9988:control".into(),
        target_fingerprint: "exact-window".into(),
        start_path: "/".into(),
        run: None,
    });
    let mut workspace = DesktopWorkspace::default();
    workspace.publish(
        vec![DesktopProject {
            id: "project".into(),
            name: "Project".into(),
            path: root.to_string_lossy().into(),
        }],
        vec![],
        None,
    );
    let consent = grants
        .window_consent("phone", "first-approval", &workspace)
        .unwrap();
    (temp, grants, workspace, consent)
}
#[test]
fn revocation_or_new_approval_cannot_resume_an_old_request() {
    let (_temp, grants, workspace, consent) = fixture();
    assert!(grants.require_window_consent(&consent, &workspace).is_ok());
    let mut fresh = grants.grants.lock().pop().unwrap();
    assert!(grants.require_window_consent(&consent, &workspace).is_err());
    fresh.id = "new-approval".into();
    grants.grants.lock().push(fresh);
    assert!(grants.require_window_consent(&consent, &workspace).is_err());
}
#[test]
fn account_disabled_or_workspace_changes_stop_exact_consent() {
    let (_temp, grants, mut workspace, consent) = fixture();
    *grants.account.lock() = Some("different-owner".into());
    assert!(grants.require_window_consent(&consent, &workspace).is_err());
    *grants.account.lock() = Some("owner".into());
    grants.disabled.store(true, Ordering::SeqCst);
    assert!(grants.require_window_consent(&consent, &workspace).is_err());
    grants.disabled.store(false, Ordering::SeqCst);
    workspace.publish(vec![], vec![], None);
    assert!(grants.require_window_consent(&consent, &workspace).is_err());
}
#[test]
fn wrong_device_and_view_only_scope_never_create_input_consent() {
    let (_temp, grants, workspace, _consent) = fixture();
    assert!(grants
        .window_consent("other-phone", "first-approval", &workspace)
        .is_err());
    grants.grants.lock()[0].target_id = "native-window:8877:9988:view".into();
    assert!(grants
        .window_consent("phone", "first-approval", &workspace)
        .is_err());
}

#[test]
fn concurrent_consent_persistence_fails_closed_without_waiting() {
    let (_temp, grants, workspace, consent) = fixture();
    let held = grants.grants.lock();
    assert!(grants.require_window_consent(&consent, &workspace).is_err());
    drop(held);
    assert!(grants.require_window_consent(&consent, &workspace).is_ok());
}
