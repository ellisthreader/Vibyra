//! Opt-in live Mac fixture for the dedicated iOS Simulator Noise run.
use super::backend::DesktopBackend;
use super::preview_grants::PreviewGrants;
use super::preview_service::PreviewService;
use super::vault::Vault;
use super::workspace::{DesktopProject, SharedWorkspace};
use serde_json::json;
use std::{
    fs,
    io::Write,
    os::unix::fs::OpenOptionsExt,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};
use vibyra_core::preview::{inspect_project, PreviewManager, PreviewPhase};
use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
use vibyra_host::EmbeddedHost;

struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}

fn write_config(value: serde_json::Value) {
    let path = PathBuf::from("/private/tmp/vibyra-preview-live-config.json");
    let _ = fs::remove_file(&path);
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .unwrap();
    file.write_all(value.to_string().as_bytes()).unwrap();
}

/// Run explicitly with `cargo test ... live_simulator_fixture -- --ignored --nocapture`.
/// It creates only temporary state and a managed full-stack localhost site.
#[test]
#[ignore = "interactive, isolated iOS Simulator fixture"]
fn live_simulator_fixture() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    fs::create_dir(&root).unwrap();
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../host/relay/tests/fixtures/preview-site.mjs")
        .canonicalize()
        .unwrap();
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
            id: "preview-fixture".into(),
            name: "Preview fixture".into(),
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
    let service = Arc::new(PreviewService::new(
        manager.clone(),
        grants.clone(),
        workspace.clone(),
    ));
    let pty = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    pty.create_session(
        "shell",
        "Fixture terminal",
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
        "Preview fixture Mac",
    )
    .unwrap();
    let url = format!("ws://127.0.0.1:{}", host.status()["port"].as_u64().unwrap());
    let pair_uri = host.invite(&url).unwrap();
    write_config(
        json!({"pairUri":pair_uri.clone(),"ws":url.clone(),"targetId":target.clone(),"ready":false}),
    );
    println!("PREVIEW_FIXTURE_CONFIG=/private/tmp/vibyra-preview-live-config.json");
    let until = Instant::now() + Duration::from_secs(120);
    let phone = loop {
        if let Some(id) = host.status()["pending"][0]["id"].as_str() {
            break id.to_owned();
        }
        assert!(Instant::now() < until, "no Simulator pairing arrived");
        std::thread::sleep(Duration::from_millis(100));
    };
    host.answer(&phone, true).unwrap();
    grants
        .grant(&phone, "preview-fixture", &root, &target)
        .unwrap();
    let grant_id = grants.list_for_device(&phone)[0].id.clone();
    write_config(json!({"pairUri":pair_uri,"ws":url,"targetId":target,
        "deviceId":phone,"grantId":grant_id,"ready":true}));
    println!("PREVIEW_FIXTURE_READY=1");
    let seconds = std::env::var("VIBYRA_PREVIEW_FIXTURE_SECONDS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(240)
        .min(900);
    std::thread::sleep(Duration::from_secs(seconds));
    manager.stop_all();
    let _ = fs::remove_file("/private/tmp/vibyra-preview-live-config.json");
}
