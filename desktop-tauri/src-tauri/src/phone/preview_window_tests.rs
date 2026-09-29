//! Real OS window fixture; opt-in, never captures an unrelated application.
use super::{
    backend::PreviewControl,
    preview_grants::PreviewGrants,
    preview_service::PreviewService,
    preview_service_fixture_support::request,
    workspace::{DesktopProject, SharedWorkspace},
};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc, time::Duration};
use vibyra_core::preview::PreviewManager;
use vibyra_host::{PreviewFrame, PreviewHandler, StreamKey};

#[test]
#[ignore = "Run the checked-in window-preview-fixture.swift --hold first"]
fn real_native_window_uses_scoped_preview_frames() {
    let info: Value =
        serde_json::from_slice(&std::fs::read("/tmp/vibyra-window-fixture.json").unwrap()).unwrap();
    assert_eq!(info["title"], "Vibyra Window Preview Fixture");
    let target = format!("native-window:{}:{}:view", info["pid"], info["id"]);
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project");
    std::fs::create_dir(&root).unwrap();
    let grants = Arc::new(PreviewGrants::load(temp.path().join("state")).unwrap());
    grants.set_account(Some("user:window-fixture")).unwrap();
    grants.set_automatic("phone", false).unwrap();
    grants.grant("phone", "project", &root, &target).unwrap();
    let id = grants.list_for_device("phone")[0].id.clone();
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "project".into(),
            name: "Generic native fixture".into(),
            path: root.to_str().unwrap().into(),
        }],
        vec![],
        None,
    );
    let service = PreviewService::new(PreviewManager::new(), grants.clone(), workspace);
    let receiver = service.subscribe("phone");
    assert_eq!(service.list("phone")["targets"], json!([])); // old client
    assert_eq!(
        PreviewControl::list_windows(&service, "phone")["targets"][0]["kind"],
        "window"
    );
    assert!(service.open("wrong-phone", &id).is_err());
    let generation = service.open("phone", &id).unwrap()["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let page = request(
        &service,
        &receiver,
        generation,
        1,
        ("GET", "/", HashMap::new(), &[]),
    );
    assert_eq!(page.info["status"], 200);
    assert!(String::from_utf8_lossy(&page.body).contains("Application Preview"));
    std::thread::sleep(Duration::from_millis(500));
    let image = request(
        &service,
        &receiver,
        generation,
        2,
        ("GET", "/frame", HashMap::new(), &[]),
    );
    assert_eq!(
        image.info["status"],
        200,
        "{}",
        String::from_utf8_lossy(&image.body)
    );
    assert!(image.body.starts_with(&[0xff, 0xd8]));
    let headers = HashMap::from([("x-vibyra-window".into(), "1".into())]);
    let input = request(
        &service,
        &receiver,
        generation,
        3,
        (
            "POST",
            "/input",
            headers,
            br#"{"sequence":1,"kind":"key","key":"enter"}"#,
        ),
    );
    assert_eq!(input.info["status"], 409);
    assert!(String::from_utf8_lossy(&input.body).contains("viewing only"));
    let denied = request(
        &service,
        &receiver,
        generation,
        4,
        ("POST", "/input", HashMap::new(), b"{}"),
    );
    assert_eq!(denied.info["status"], 404);
    // Permission changes replace rather than accumulate view/control grants.
    let control = target.replace(":view", ":control");
    grants.grant("phone", "project", &root, &control).unwrap();
    assert_eq!(grants.list_for_device("phone").len(), 1);
    assert!(service.open("phone", &id).is_err());
    PreviewControl::close(&service, "phone", generation);
    let control_id = grants.list_for_device("phone")[0].id.clone();
    let controlled = service.open("phone", &control_id).unwrap()["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    // Another approved phone cannot acquire simultaneous control of the window.
    grants
        .grant("second-phone", "project", &root, &control)
        .unwrap();
    let second_id = grants.list_for_device("second-phone")[0].id.clone();
    assert!(service.open("second-phone", &second_id).is_err());
    PreviewControl::close(&service, "phone", controlled);
    assert!(service.open("second-phone", &second_id).is_ok());
    service.disconnected("second-phone");
    grants.grant("phone", "project", &root, &target).unwrap();
    assert!(service.open("phone", &control_id).is_err());
    let view_id = grants.list_for_device("phone")[0].id.clone();
    let generation = service.open("phone", &view_id).unwrap()["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    grants.revoke("phone", "project", &root, &target).unwrap();
    assert!(service
        .receive(
            "phone",
            PreviewFrame::Open {
                key: StreamKey::new(5, generation).unwrap()
            }
        )
        .is_err());
    PreviewControl::close(&service, "phone", generation);
    service.disconnected("phone");
}
