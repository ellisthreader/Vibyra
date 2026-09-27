//! Public WebSocket → Noise → DesktopBackend → PreviewService proof.
#[path = "preview_noise_tests/peer.rs"]
mod peer;

use super::backend::DesktopBackend;
use super::preview_grants::PreviewGrants;
use super::preview_service::PreviewService;
use super::vault::Vault;
use super::workspace::{DesktopProject, SharedWorkspace};
use peer::Peer;
use serde_json::{json, Value};
use std::fs;
use std::sync::Arc;
use vibyra_core::preview::{inspect_project, PreviewManager, PreviewPhase};
use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
use vibyra_host::{EmbeddedHost, PreviewFrame as Frame, StreamKey, WINDOW_BYTES};

struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}

#[tokio::test(flavor = "multi_thread")]
async fn approved_site_and_terminal_share_actual_encrypted_host_connection() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    fs::create_dir(&root).unwrap();
    fs::write(
        root.join("index.html"),
        "<h1>Encrypted Preview fixture</h1>",
    )
    .unwrap();
    fs::write(root.join("asset.bin"), vec![0x5au8; 10 * 1024 * 1024]).unwrap();
    let target = inspect_project(root.to_str().unwrap())
        .unwrap()
        .targets
        .remove(0)
        .id;
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "project-1".into(),
            name: "Encrypted site".into(),
            path: root.to_str().unwrap().into(),
        }],
        vec![],
        None,
    );
    let preview = PreviewManager::new();
    assert_eq!(
        preview
            .start(root.to_str().unwrap(), &target)
            .unwrap()
            .phase,
        PreviewPhase::Running
    );
    let grants = Arc::new(PreviewGrants::load(temp.path().join("grants")).unwrap());
    grants.set_account(Some("user:fixture-account")).unwrap();
    let service = Arc::new(PreviewService::new(
        preview.clone(),
        grants.clone(),
        workspace.clone(),
    ));
    let pty = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    pty.create_session(
        "shell",
        "Live terminal",
        &LaunchSpec {
            program: "/bin/sh".into(),
            args: vec!["-c".into(), "echo READY; read line".into()],
            env: vec![],
            env_remove: vec![],
            cwd: None,
            rows: 30,
            cols: 100,
        },
    )
    .unwrap();
    let backend = DesktopBackend::new_with_preview(
        pty,
        workspace,
        Default::default(),
        Vault::empty(),
        Default::default(),
        Some(service),
    )
    .unwrap();
    let host = EmbeddedHost::start(
        temp.path().join("host"),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(backend),
        "Preview test Mac",
    )
    .unwrap();
    let mut peer = Peer::connect(&host).await;
    grants.grant(&peer.id, "project-1", &root, &target).unwrap();

    peer.send_json(json!({"id":"list","method":"preview.list","params":{}}))
        .await;
    let list = peer.reply("list").await;
    assert_eq!(list["ok"], true, "{list}");
    let grant_id = list["result"]["targets"][0]["grantId"].as_str().unwrap();
    assert!(list.to_string().contains("grantId"));
    assert!(!list.to_string().contains("127.0.0.1"));
    peer.send_json(json!({"id":"open","method":"preview.open","params":{"grantId":grant_id}}))
        .await;
    let opened = peer.reply("open").await;
    assert_eq!(opened["ok"], true, "{opened}");
    let generation: u64 = opened["result"]["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!(opened["result"].get("url").is_none());
    let key = StreamKey::new(1, generation).unwrap();
    peer.send_frame(Frame::Open { key }).await;
    let initial = peer.next_frame().await;
    assert!(matches!(initial, Frame::Credit { key: credited, .. } if credited == key));
    let metadata = json!({"v":1,"kind":"http","method":"GET","path":"/asset.bin","headers":{}})
        .to_string()
        .into_bytes();
    peer.send_frame(Frame::Data {
        key,
        sequence: 0,
        bytes: metadata,
    })
    .await;
    peer.send_frame(Frame::End { key, sequence: 1 }).await;
    let mut opened_response = false;
    let mut body = 0usize;
    let mut received = 0usize;
    let mut metadata_seen = false;
    let mut terminal_reply = false;
    let mut terminal_sent = false;
    loop {
        let plain = peer.next().await;
        if let Ok(reply) = serde_json::from_slice::<Value>(&plain) {
            if reply["id"] == "terminal" {
                assert_eq!(reply["ok"], true, "{reply}");
                assert_eq!(reply["result"]["sessionCount"], 1);
                terminal_reply = true;
            }
            continue;
        }
        match Frame::decode(&plain).unwrap() {
            Frame::Open { key: response } if response == key => {
                opened_response = true;
                peer.send_frame(Frame::Credit {
                    key,
                    total: WINDOW_BYTES as u64,
                })
                .await;
            }
            Frame::Data {
                key: response,
                sequence,
                bytes,
            } if response == key => {
                assert!(opened_response);
                if sequence == 0 {
                    let info: Value = serde_json::from_slice(&bytes).unwrap();
                    assert_eq!(info["status"], 200);
                    metadata_seen = true;
                } else {
                    assert!(bytes.iter().all(|byte| *byte == 0x5a));
                    body += bytes.len();
                }
                received += bytes.len();
                peer.send_frame(Frame::Credit {
                    key,
                    total: (WINDOW_BYTES + received) as u64,
                })
                .await;
                if body >= 64 * 1024 && !terminal_sent {
                    peer.send_json(json!({"id":"terminal","method":"session.list","params":{}}))
                        .await;
                    terminal_sent = true;
                }
            }
            Frame::End { key: response, .. } if response == key => break,
            Frame::Credit { .. } => {}
            other => {
                panic!("unexpected encrypted Preview frame after {body} body bytes: {other:?}")
            }
        }
    }
    assert!(metadata_seen && terminal_reply);
    assert_eq!(body, 10 * 1024 * 1024);
    preview.stop_all();
}
