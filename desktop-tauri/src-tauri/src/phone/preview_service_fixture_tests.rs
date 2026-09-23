//! Managed PHP Preview fixture acceptance.
use super::preview_grants::PreviewGrants;
use super::preview_service::PreviewService;
use super::preview_service_fixture_support::{request, SITE};
use super::workspace::{DesktopProject, SharedWorkspace};
use std::{collections::HashMap, fs, process::Command, sync::Arc, time::Duration};
use vibyra_core::preview::{inspect_project, PreviewManager, PreviewPhase};
use vibyra_host::PreviewHandler;

#[test]
fn managed_backend_preserves_form_csrf_redirect_two_cookies_sse_and_ten_megabytes() {
    if Command::new("php").arg("-v").output().is_err() {
        eprintln!("skipped: PHP not installed");
        return;
    }
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("index.php"), SITE).unwrap();
    fs::write(root.join("saved.txt"), "initial").unwrap();
    let target = inspect_project(root.to_str().unwrap())
        .unwrap()
        .targets
        .remove(0)
        .id;
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "project".into(),
            name: "Site".into(),
            path: root.to_str().unwrap().into(),
        }],
        vec![],
        None,
    );
    let grants = Arc::new(PreviewGrants::load(temp.path().join("state")).unwrap());
    grants.set_account(Some("user:fixture-account")).unwrap();
    grants.grant("phone", "project", &root, &target).unwrap();
    let grant_id = grants.list_for_device("phone")[0].id.clone();
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
    let service = PreviewService::new(manager.clone(), grants, workspace);
    let receiver = service.subscribe("phone");
    let generation: u64 = service.open("phone", &grant_id).unwrap()["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let home = request(
        &service,
        &receiver,
        generation,
        1,
        ("GET", "/", HashMap::new(), &[]),
    );
    assert_eq!(home.info["status"], 200);
    assert!(String::from_utf8_lossy(&home.body).contains("<form"));
    assert_eq!(home.info["setCookies"].as_array().unwrap().len(), 1);
    let mut headers = HashMap::new();
    headers.insert("cookie".into(), "preview_csrf=fixture-token".into());
    headers.insert(
        "content-type".into(),
        "application/x-www-form-urlencoded".into(),
    );
    headers.insert("origin".into(), "http://127.0.0.1:8000".into());
    let post = request(
        &service,
        &receiver,
        generation,
        2,
        (
            "POST",
            "/submit",
            headers,
            b"csrf=fixture-token&value=phone-update",
        ),
    );
    assert_eq!(post.info["status"], 303);
    assert_eq!(post.info["headers"]["location"], "/page");
    assert_eq!(post.info["setCookies"].as_array().unwrap().len(), 2);
    let page = request(
        &service,
        &receiver,
        generation,
        3,
        ("GET", "/page", HashMap::new(), &[]),
    );
    assert_eq!(page.info["status"], 200);
    assert_eq!(page.body, b"saved=phone-update");
    let events = request(
        &service,
        &receiver,
        generation,
        4,
        ("GET", "/events", HashMap::new(), &[]),
    );
    assert!(events.info["headers"]["content-type"]
        .as_str()
        .unwrap()
        .starts_with("text/event-stream"));
    assert!(String::from_utf8_lossy(&events.body).contains("data: connected\n\ndata: updated"));
    let asset = request(
        &service,
        &receiver,
        generation,
        5,
        ("GET", "/assets/large", HashMap::new(), &[]),
    );
    assert_eq!(asset.info["status"], 200);
    assert_eq!(asset.body.len(), 10 * 1024 * 1024);
    assert!(asset.body.iter().all(|byte| *byte == b'Z'));
    // A saved code edit is served by the same running Mac process and grant.
    fs::write(
        root.join("index.php"),
        SITE.replace("echo 'saved='", "echo 'fresh='"),
    )
    .unwrap();
    let updated = request(
        &service,
        &receiver,
        generation,
        6,
        ("GET", "/page", HashMap::new(), &[]),
    );
    assert_eq!(updated.body, b"fresh=phone-update");
    manager.stop_all();
}
