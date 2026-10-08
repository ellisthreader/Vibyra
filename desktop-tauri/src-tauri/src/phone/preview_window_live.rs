//! Isolated physical-phone proof: shares only the checked-in synthetic window.
use super::{
    backend::PreviewControl,
    preview_grants::PreviewGrants,
    preview_service::PreviewService,
    workspace::{DesktopProject, SharedWorkspace},
};
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    os::unix::fs::OpenOptionsExt,
    sync::{mpsc, Arc},
    time::{Duration, Instant},
};
use vibyra_core::preview::PreviewManager;
use vibyra_host::{Backend, EmbeddedHost, PreviewHandler};

struct Fixture(Arc<PreviewService>);
impl Backend for Fixture {
    fn handle(&self, device: &str, method: &str, params: Value) -> Result<Value, String> {
        match method {
            "host.state" => Ok(json!({"capabilities":{"previewWindowBytes":65536}})),
            "session.list" => Ok(json!({"sessions":[],"sessionCount":0})),
            "preview.list" => Ok(PreviewControl::list_windows(self.0.as_ref(), device)),
            "preview.open" => self
                .0
                .open(device, params["grantId"].as_str().ok_or("Missing grant")?),
            _ => Err("Fixture method unavailable".into()),
        }
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        mpsc::channel().1
    }
    fn preview(&self, _: &str) -> Option<Arc<dyn PreviewHandler>> {
        Some(self.0.clone())
    }
    fn disconnected(&self, device: &str) {
        self.0.disconnected(device);
    }
    fn pairing_notice(&self) -> &'static str {
        "Synthetic window Preview fixture only"
    }
}

#[test]
#[ignore = "Requires the synthetic window fixture and an isolated native phone QA build"]
fn live_native_window_phone_fixture() {
    let address = std::env::var("VIBYRA_WINDOW_QA_ADDRESS").expect("Set the Mac LAN IP");
    let info: Value =
        serde_json::from_slice(&fs::read("/tmp/vibyra-window-fixture.json").unwrap()).unwrap();
    assert_eq!(info["title"], "Vibyra Window Preview Fixture");
    let target = format!("native-window:{}:{}:view", info["pid"], info["id"]);
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project");
    fs::create_dir(&root).unwrap();
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "window-qa".into(),
            name: "Synthetic native window".into(),
            path: root.to_str().unwrap().into(),
        }],
        vec![],
        None,
    );
    let grants = Arc::new(PreviewGrants::load(temp.path().join("grants")).unwrap());
    grants.set_account(Some("user:window-qa")).unwrap();
    let service = Arc::new(PreviewService::new(
        PreviewManager::new(),
        grants.clone(),
        workspace,
    ));
    let host = EmbeddedHost::start(
        temp.path().join("host"),
        format!("{address}:0").parse().unwrap(),
        Arc::new(Fixture(service)),
        "Vibyra synthetic window QA",
    )
    .unwrap();
    let url = format!("ws://{address}:{}", host.status()["port"].as_u64().unwrap());
    let pair = host.invite(&url).unwrap();
    let path = "/tmp/vibyra-window-phone-config.json";
    let _ = fs::remove_file(path);
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .unwrap();
    file.write_all(json!({"pairUri":pair}).to_string().as_bytes())
        .unwrap();
    println!("Window QA ready for its isolated phone fixture (configuration is private).");
    let until = Instant::now() + Duration::from_secs(300);
    let device = loop {
        if let Some(id) = host.status()["pending"][0]["id"].as_str() {
            break id.to_owned();
        }
        assert!(Instant::now() < until, "No fixture phone paired");
        std::thread::sleep(Duration::from_millis(200));
    };
    host.answer(&device, true).unwrap();
    grants.set_automatic(&device, false).unwrap();
    grants.grant(&device, "window-qa", &root, &target).unwrap();
    println!("Window QA phone paired; synthetic window granted read-only.");
    std::thread::sleep(Duration::from_secs(300));
    let _ = fs::remove_file(path);
}
