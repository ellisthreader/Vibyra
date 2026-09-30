use super::*;
use crate::phone::backend::PreviewControl;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use vibyra_core::preview::{with_launch_authorization, PreviewPhase};
use vibyra_host::{with_rpc_access, PreviewAccess};

struct Access {
    permissions: Vec<&'static str>,
    live: AtomicBool,
}
impl PreviewAccess for Access {
    fn permits(&self, permission: &str) -> bool {
        self.live.load(Ordering::SeqCst) && self.permissions.contains(&permission)
    }
}
fn access(permissions: Vec<&'static str>) -> Arc<Access> {
    Arc::new(Access {
        permissions,
        live: AtomicBool::new(true),
    })
}
#[test]
fn preview_run_requires_authenticated_rpc_and_separate_terminal_permission() {
    let Some((_dir, service, _)) = run_control::tests::fixture() else {
        return;
    };
    let params = serde_json::json!({"projectId":"project","targetId":".::desktop-desktop"});
    assert!(PreviewControl::run(&service, "phone", &params).is_err());
    let viewer = access(vec!["preview:access", "screen:view"]);
    assert!(with_rpc_access(viewer, || PreviewControl::run(&service, "phone", &params)).is_err());
    let terminal = access(vec!["preview:access", "terminal:access"]);
    let asked =
        with_rpc_access(terminal, || PreviewControl::run(&service, "phone", &params)).unwrap();
    assert_eq!(asked["approvalRequired"], true);
}
#[test]
fn revocation_after_detection_prevents_the_actual_preview_process_spawn() {
    let Some((dir, service, _)) = run_control::tests::fixture() else {
        return;
    };
    let marker = dir.path().join("spawned");
    std::fs::write(
        dir.path().join("app/package.json"),
        serde_json::json!({"scripts":{
        "desktop":format!("touch {} && sleep 30",marker.display())}})
        .to_string(),
    )
    .unwrap();
    run_list::approvals_changed();
    let row = service.runnable("phone").remove(0);
    let params = serde_json::json!({"projectId":"project","targetId":row["targetId"],
        "approve":true,"commandVersion":row["commandVersion"]});
    let grant = access(vec!["preview:access", "terminal:access"]);
    let revoke = grant.clone();
    // The injected outer check runs at command.spawn(), after detection/approval.
    let result = with_launch_authorization(
        Arc::new(move |process| {
            if process {
                revoke.live.store(false, Ordering::SeqCst);
            }
            Ok(())
        }),
        || with_rpc_access(grant, || PreviewControl::run(&service, "phone", &params)),
    );
    assert!(result.is_err(), "{result:?}");
    assert!(
        !marker.exists(),
        "revoked request must not execute the app command"
    );
    assert_eq!(
        service
            .inner
            .manager
            .status(
                dir.path().join("app").to_str().unwrap(),
                row["targetId"].as_str().unwrap()
            )
            .unwrap()
            .phase,
        PreviewPhase::Idle
    );
    assert!(vibyra_host::current_rpc_access().is_none());
}
