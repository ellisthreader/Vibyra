use super::*;
use crate::{
    phone::{
        preview_grants::PreviewGrants,
        workspace::{DesktopProject, SharedWorkspace},
    },
    window_preview::WindowInfo,
};
use std::sync::Arc;
use vibyra_core::preview::PreviewManager;
use vibyra_host::PreviewHandler;

pub(super) fn fixture() -> (tempfile::TempDir, PreviewService) {
    let dir = tempfile::tempdir().unwrap();
    let grants = Arc::new(PreviewGrants::load(dir.path().join("grants")).unwrap());
    grants.set_account(Some("owner")).unwrap();
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "project".into(),
            name: "Project".into(),
            path: dir.path().display().to_string(),
        }],
        vec![],
        None,
    );
    let service = PreviewService::new(PreviewManager::new(), grants, workspace);
    service.inner.handoff.lock().candidates.insert(
        ("phone".into(), "candidate".into()),
        Candidate {
            account: "owner".into(),
            seen: Instant::now(),
            window: OwnedWindow {
                project: "project".into(),
                project_root: dir.path().canonicalize().unwrap(),
                root: dir.path().canonicalize().unwrap(),
                info: WindowInfo {
                    id: 42,
                    pid: 21,
                    name: "Fixture".into(),
                    title: "Window".into(),
                    fingerprint: "original".into(),
                },
            },
        },
    );
    (dir, service)
}

#[test]
fn candidate_is_not_a_grant_and_cannot_cross_device_or_disconnect() {
    let (_dir, service) = fixture();
    assert!(service.open("phone", "candidate").is_err());
    assert!(service
        .share_window("stranger", "candidate")
        .unwrap_err()
        .contains("expired"));
    service.disconnected("phone");
    assert!(service
        .share_window("phone", "candidate")
        .unwrap_err()
        .contains("expired"));
    assert!(service.inner.grants.list_for_device("phone").is_empty());
}

#[test]
fn expired_or_changed_account_and_project_candidates_fail_closed() {
    let (_dir, service) = fixture();
    service
        .inner
        .handoff
        .lock()
        .candidates
        .get_mut(&("phone".into(), "candidate".into()))
        .unwrap()
        .seen = Instant::now() - Duration::from_secs(61);
    assert!(service
        .share_window("phone", "candidate")
        .unwrap_err()
        .contains("expired"));
    let (_dir, service) = fixture();
    service
        .inner
        .grants
        .set_account(Some("other-owner"))
        .unwrap();
    assert!(service
        .share_window("phone", "candidate")
        .unwrap_err()
        .contains("account"));
    let (dir, service) = fixture();
    let moved = dir.path().join("another-project");
    std::fs::create_dir(&moved).unwrap();
    service.inner.workspace.write().publish(
        vec![DesktopProject {
            id: "project".into(),
            name: "Changed".into(),
            path: moved.display().to_string(),
        }],
        vec![],
        None,
    );
    assert!(service
        .share_window("phone", "candidate")
        .unwrap_err()
        .contains("folder changed"));
    assert!(service.inner.grants.list_for_device("phone").is_empty());
}

#[test]
fn native_candidate_identity_includes_project_root_worktree_and_process_start() {
    let (_dir, service) = fixture();
    let original = service
        .inner
        .handoff
        .lock()
        .candidates
        .values()
        .next()
        .unwrap()
        .window
        .clone();
    for change in 0..4 {
        let mut replaced = original.clone();
        match change {
            0 => replaced.project = "other".into(),
            1 => replaced.project_root = "/other".into(),
            2 => replaced.root = "/other/worktree".into(),
            _ => replaced.info.fingerprint = "restarted".into(),
        }
        assert!(!original.same(&replaced));
    }
}

#[test]
fn window_input_follows_the_computers_typing_switch() {
    use std::sync::atomic::{AtomicBool, Ordering};
    let (_dir, service) = fixture();
    let typing = Arc::new(AtomicBool::new(false));
    service.set_typing(typing.clone());
    assert!(
        !service.typing_allowed(),
        "no taps while typing from the phone is off"
    );
    typing.store(true, Ordering::SeqCst);
    assert!(service.typing_allowed());
}
