//! An external loopback server stays owned by its launcher while phone Preview attaches.
use super::preview_attached_fixture::{request, request_with_headers, Site};
use super::preview_grants::PreviewGrants;
use super::preview_service::PreviewService;
use super::workspace::{DesktopProject, SharedWorkspace};
use serde_json::{json, Value};
use std::sync::Arc;
use vibyra_core::preview::{PreviewManager, PreviewPhase};
use vibyra_host::{PreviewFrame as Frame, PreviewHandler, StreamKey};

#[test]
fn attached_server_survives_downtime_and_never_becomes_a_managed_process() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("hke");
    std::fs::create_dir(&root).unwrap();
    let site = Site::bind(0, "first");
    let target = format!("attached-port:{}", site.port);
    let grants = Arc::new(PreviewGrants::load(temp.path().join("grants")).unwrap());
    grants.set_account(Some("user:fixture-account")).unwrap();
    grants
        .grant_at("phone", "project", &root, &target, "/menu?tag=soy")
        .unwrap();
    let grant_id = grants.list_for_device("phone")[0].id.clone();
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "project".into(),
            name: "HKE".into(),
            path: root.to_str().unwrap().into(),
        }],
        vec![],
        None,
    );
    let manager = PreviewManager::new();
    let service = PreviewService::new(manager.clone(), grants.clone(), workspace);
    let receiver = service.subscribe("phone");
    assert_eq!(
        service.list("wrong")["targets"].as_array().unwrap().len(),
        0
    );
    assert_eq!(service.list("phone")["targets"][0]["running"], true);
    assert!(service.start("wrong", &grant_id).is_err());
    assert!(service.open("wrong", &grant_id).is_err());
    assert_eq!(
        service.start("phone", &grant_id).unwrap()["phase"],
        "running"
    );
    assert_eq!(
        manager
            .status(root.to_str().unwrap(), &target)
            .unwrap()
            .phase,
        PreviewPhase::Idle
    );
    let opened = service.open("phone", &grant_id).unwrap();
    assert_eq!(opened["startPath"], "/menu?tag=soy");
    let generation: u64 = opened["generation"].as_str().unwrap().parse().unwrap();
    let (redirect, _) = request(&service, &receiver, generation, 1, "/");
    assert_eq!(redirect["status"], 302);
    assert_eq!(redirect["headers"]["location"], "/menu");
    let (menu, body) = request(&service, &receiver, generation, 2, "/menu");
    assert_eq!(menu["status"], 200);
    let html = String::from_utf8(body).unwrap();
    assert!(html.contains("first menu"));
    assert!(html.contains("http://127.0.0.1:55331/assets/app.css"));
    assert!(!html.contains(&format!("http://127.0.0.1:{}/assets", site.port)));
    let (_, asset) = request(&service, &receiver, generation, 3, "/assets/app.css");
    assert_eq!(asset, b"/* first asset */");

    let port = site.stop();
    assert_eq!(
        service.list("phone")["targets"].as_array().unwrap().len(),
        1
    );
    assert_eq!(service.list("phone")["targets"][0]["running"], false);
    assert!(service.start("phone", &grant_id).is_err());
    assert!(service.open("phone", &grant_id).is_err());
    let site = Site::bind(port, "restarted");
    assert_eq!(
        service.start("phone", &grant_id).unwrap()["phase"],
        "running"
    );
    let reopened: u64 = service.open("phone", &grant_id).unwrap()["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let (_, body) = request(&service, &receiver, reopened, 4, "/menu");
    assert!(String::from_utf8(body).unwrap().contains("restarted menu"));
    grants.revoke("phone", "project", &root, &target).unwrap();
    assert!(service.open("phone", &grant_id).is_err());
    assert!(service
        .receive(
            "phone",
            Frame::Open {
                key: StreamKey::new(5, reopened).unwrap()
            }
        )
        .is_err());
    assert_eq!(
        site.stop(),
        port,
        "revoking Preview did not stop the external server"
    );
}

#[test]
#[ignore = "requires a running HKE server on 127.0.0.1:8001 and VIBYRA_HKE_PREVIEW_TEST=1"]
fn real_hke_menu_rewrites_absolute_asset_origins_over_preview_frames() {
    if std::env::var("VIBYRA_HKE_PREVIEW_TEST").as_deref() != Ok("1") {
        return;
    }
    let root = std::path::Path::new("/Users/ellis/Desktop/HKE");
    let temp = tempfile::tempdir().unwrap();
    let grants = Arc::new(PreviewGrants::load(temp.path().join("grants")).unwrap());
    grants.set_account(Some("user:fixture-account")).unwrap();
    grants
        .grant_at("phone", "hke", root, "attached-port:8001", "/menu")
        .unwrap();
    let grant_id = grants.list_for_device("phone")[0].id.clone();
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "hke".into(),
            name: "HKE".into(),
            path: root.to_str().unwrap().into(),
        }],
        vec![],
        None,
    );
    let service = PreviewService::new(PreviewManager::new(), grants, workspace);
    let receiver = service.subscribe("phone");
    assert_eq!(
        service.start("phone", &grant_id).unwrap()["phase"],
        "running"
    );
    let generation: u64 = service.open("phone", &grant_id).unwrap()["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let (info, body) = request(&service, &receiver, generation, 1, "/menu");
    assert_eq!(info["status"], 200);
    let html = String::from_utf8(body).unwrap();
    assert!(html.contains("http://127.0.0.1:55331/images/menu-items/"));
    assert!(!html.contains("http://127.0.0.1:8001/images/menu-items/"));
    let (inertia, body) = request_with_headers(
        &service,
        &receiver,
        generation,
        2,
        "/menu",
        json!({"x-inertia":"true","x-requested-with":"XMLHttpRequest"}),
    );
    assert_eq!(inertia["status"], 200);
    assert_eq!(inertia["headers"]["x-inertia"], "true");
    let page: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(page["component"], "Welcome");
}
