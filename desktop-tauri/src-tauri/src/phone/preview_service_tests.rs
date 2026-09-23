use super::preview_grants::PreviewGrants;
use super::preview_service::PreviewService;
use super::workspace::{DesktopProject, SharedWorkspace};
use std::fs;
use std::sync::Arc;
use std::time::Duration;
use vibyra_core::preview::{inspect_project, PreviewManager, PreviewPhase};
use vibyra_host::{PreviewFrame as Frame, PreviewHandler, StreamKey, WINDOW_BYTES};

#[test]
fn approved_static_site_crosses_http_frames_without_exposing_loopback_url() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("index.html"), "<h1>Live Preview fixture</h1>").unwrap();
    let target = inspect_project(root.to_str().unwrap())
        .unwrap()
        .targets
        .remove(0)
        .id;
    let grants = Arc::new(PreviewGrants::load(temp.path().join("state")).unwrap());
    grants.set_account(Some("user:fixture-account")).unwrap();
    grants
        .grant("phone-1", "project-1", &root, &target)
        .unwrap();
    let grant_id = grants.list_for_device("phone-1")[0].id.clone();
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "project-1".into(),
            name: "Site".into(),
            path: root.to_str().unwrap().into(),
        }],
        vec![],
        None,
    );
    let manager = PreviewManager::new();
    let started = manager.start(root.to_str().unwrap(), &target).unwrap();
    assert_eq!(started.phase, PreviewPhase::Running);
    assert_eq!(
        manager
            .status(root.to_str().unwrap(), &target)
            .unwrap()
            .phase,
        PreviewPhase::Running
    );
    let service = PreviewService::new(manager.clone(), grants.clone(), workspace.clone());
    let rx = service.subscribe("phone-1");
    assert!(service.open("unpaired", &grant_id).is_err());
    let opened = service.open("phone-1", &grant_id).unwrap();
    let generation: u64 = opened["generation"].as_str().unwrap().parse().unwrap();
    assert!(opened.get("url").is_none());
    let key = StreamKey::new(1, generation).unwrap();
    service.receive("phone-1", Frame::Open { key }).unwrap();
    assert!(matches!(
        rx.recv_timeout(Duration::from_secs(3)).unwrap(),
        Frame::Credit { .. }
    ));
    let metadata = serde_json::json!({"v":1,"kind":"http","method":"GET","path":"/",
        "headers":{"accept":"text/html"}})
    .to_string()
    .into_bytes();
    service
        .receive(
            "phone-1",
            Frame::Data {
                key,
                sequence: 0,
                bytes: metadata,
            },
        )
        .unwrap();
    assert!(matches!(
        rx.recv_timeout(Duration::from_secs(3)).unwrap(),
        Frame::Credit { .. }
    ));
    service
        .receive("phone-1", Frame::End { key, sequence: 1 })
        .unwrap();
    assert_eq!(
        rx.recv_timeout(Duration::from_secs(5)).unwrap(),
        Frame::Open { key }
    );
    service
        .receive(
            "phone-1",
            Frame::Credit {
                key,
                total: WINDOW_BYTES as u64,
            },
        )
        .unwrap();
    let mut response = Vec::new();
    loop {
        match rx.recv_timeout(Duration::from_secs(5)).unwrap() {
            Frame::Data { bytes, .. } => response.push(bytes),
            Frame::End { .. } => break,
            other => panic!("unexpected response frame: {other:?}"),
        }
    }
    let info: serde_json::Value = serde_json::from_slice(&response[0]).unwrap();
    assert_eq!(info["status"], 200);
    let body = response[1..].concat();
    assert!(String::from_utf8_lossy(&body).contains("Live Preview fixture"));
    let origin = manager.status(root.to_str().unwrap(), &target).unwrap().url;
    service.change_runtime_id_for_test("phone-1", generation);
    assert!(
        service
            .receive(
                "phone-1",
                Frame::Open {
                    key: StreamKey::new(2, generation).unwrap()
                }
            )
            .is_err(),
        "same URL with another runtime identity expires binding"
    );
    assert_eq!(
        manager.status(root.to_str().unwrap(), &target).unwrap().url,
        origin
    );
    let second: u64 = service.open("phone-1", &grant_id).unwrap()["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    manager.stop(root.to_str().unwrap(), &target).unwrap();
    manager.start(root.to_str().unwrap(), &target).unwrap();
    assert!(
        service
            .receive(
                "phone-1",
                Frame::Open {
                    key: StreamKey::new(3, second).unwrap()
                }
            )
            .is_err(),
        "a real stop/start expires an old generation"
    );
    manager.stop_all();
}
