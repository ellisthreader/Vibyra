//! A managed local target relays a real WebSocket Upgrade and opaque frames.
use super::preview_grants::PreviewGrants;
use super::preview_service::PreviewService;
use super::preview_upgrade_handshake::{open_websocket, receive};
use super::workspace::{DesktopProject, SharedWorkspace};
use std::{fs, path::PathBuf, process::Command, sync::Arc, time::Duration};
use vibyra_core::preview::{inspect_project, PreviewManager, PreviewPhase};
use vibyra_host::{PreviewFrame as Frame, PreviewHandler};

#[test]
fn approved_websocket_echo_is_full_duplex_and_revocation_cancels_it() {
    if Command::new("php").arg("-v").output().is_err()
        || Command::new("node").arg("-v").output().is_err()
    {
        eprintln!("skipped: Node/PHP not installed");
        return;
    }
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../host/relay/tests/fixtures/preview-site.mjs")
        .canonicalize()
        .unwrap();
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("managed");
    fs::create_dir(&root).unwrap();
    fs::write(
        root.join("composer.json"),
        r#"{"require":{"laravel/framework":"1"}}"#,
    )
    .unwrap();
    let runner = format!(
        r#"<?php
$port = '';
foreach ($argv as $arg) if (str_starts_with($arg, '--port=')) $port = substr($arg, 7);
if (!ctype_digit($port)) exit(2);
putenv('PORT='.$port);
passthru('node '.escapeshellarg('{}'));
"#,
        fixture.display()
    );
    fs::write(root.join("artisan"), runner).unwrap();
    let target = inspect_project(root.to_str().unwrap())
        .unwrap()
        .targets
        .remove(0)
        .id;
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "project".into(),
            name: "WS fixture".into(),
            path: root.to_str().unwrap().into(),
        }],
        vec![],
        None,
    );
    let manager = PreviewManager::new();
    manager.start(root.to_str().unwrap(), &target).unwrap();
    for _ in 0..100 {
        if manager
            .status(root.to_str().unwrap(), &target)
            .unwrap()
            .phase
            == PreviewPhase::Running
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    assert_eq!(
        manager
            .status(root.to_str().unwrap(), &target)
            .unwrap()
            .phase,
        PreviewPhase::Running
    );
    let grants = Arc::new(PreviewGrants::load(temp.path().join("grants")).unwrap());
    grants.set_account(Some("user:fixture-account")).unwrap();
    grants.grant("phone", "project", &root, &target).unwrap();
    let grant_id = grants.list_for_device("phone")[0].id.clone();
    let service = PreviewService::new(manager.clone(), grants.clone(), workspace);
    let receiver = service.subscribe("phone");
    let generation: u64 = service.open("phone", &grant_id).unwrap()["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let key = open_websocket(&service, &receiver, generation);
    let mask = [1u8, 2, 3, 4];
    let mut wire = vec![0x81, 0x80 | 5];
    wire.extend(mask);
    wire.extend(
        b"hello"
            .iter()
            .enumerate()
            .map(|(index, byte)| byte ^ mask[index % 4]),
    );
    service
        .receive(
            "phone",
            Frame::Data {
                key,
                sequence: 1,
                bytes: wire,
            },
        )
        .unwrap();
    let mut echoed = false;
    for _ in 0..10 {
        match receive(&receiver) {
            Frame::Data {
                key: value,
                sequence: 1,
                bytes,
            } if value == key => {
                assert!(bytes
                    .windows(b"echo:hello".len())
                    .any(|window| window == b"echo:hello"));
                echoed = true;
                break;
            }
            Frame::Credit { .. } => {}
            other => panic!("unexpected WebSocket frame: {other:?}"),
        }
    }
    assert!(echoed);
    grants.revoke("phone", "project", &root, &target).unwrap();
    let mut canceled = false;
    for _ in 0..10 {
        match receive(&receiver) {
            Frame::Cancel { key: value } if value == key => {
                canceled = true;
                break;
            }
            Frame::Credit { .. } => {}
            other => panic!("unexpected frame after revocation: {other:?}"),
        }
    }
    assert!(canceled);
    manager.stop_all();
}
