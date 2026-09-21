//! Isolated real Desktop shared-chat backend for encrypted iPhone acceptance.
use serde_json::{json, Value};
use std::{
    io::BufRead,
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use vibyra_core::pty::{FlushConfig, OutputSink, PtyManager};
use vibyra_desktop_lib::shared_chats;
use vibyra_host::EmbeddedHost;
// The desktop's own modules, not copies, so the probe cannot drift from them.
#[allow(dead_code)]
#[path = "../src/phone/backend.rs"]
mod backend;
#[allow(dead_code)]
#[path = "../src/phone/control.rs"]
mod control;
#[allow(dead_code)]
#[path = "../src/phone/frames.rs"]
mod frames;
#[allow(dead_code)]
#[path = "../src/phone/manage.rs"]
mod manage;
#[allow(dead_code)]
#[path = "../src/phone/railway.rs"]
mod railway;
#[allow(dead_code)]
#[path = "../src/phone/railway_resources.rs"]
mod railway_resources;
#[allow(dead_code)]
#[path = "../src/phone/railway_tools.rs"]
mod railway_tools;
#[allow(dead_code)]
#[path = "../src/phone/requests.rs"]
mod requests;
#[allow(dead_code)]
#[path = "../src/phone/scaffold.rs"]
mod scaffold;
#[allow(dead_code)]
#[path = "../src/phone/stream.rs"]
mod stream;
#[allow(dead_code)]
#[path = "../src/phone/vault.rs"]
mod vault;
#[allow(dead_code)]
#[path = "../src/phone/workspace.rs"]
mod workspace;

#[path = "../src/phone/shared_backend.rs"]
mod shared_backend;
struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}
fn main() {
    let mut args = std::env::args().skip(1);
    let root = args.next().expect("project directory");
    let state = args.next().expect("state directory");
    let chats = shared_chats::SharedChats::new(std::path::Path::new(&state).join("chats"));
    let session = chats
        .create_configured(
            "shared-project".into(),
            "Shared chat probe".into(),
            root.clone().into(),
            "default".into(),
            "11111111-1111-4111-a111-111111111111".into(),
            "Desktop and iPhone".into(),
            Some(vibyra_engine::DesktopConversationOptions::default()),
        )
        .expect("create real Codex chat");
    println!("session {}", session);
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let workspace = workspace::SharedWorkspace::default();
    workspace.write().publish(
        vec![workspace::DesktopProject {
            id: "shared-project".into(),
            name: "Shared chat probe".into(),
            path: root,
        }],
        vec![],
        None,
    );
    let typing = Arc::new(AtomicBool::new(true));
    let vault = vault::Vault::new(std::path::Path::new(&state).join("vault-source"));
    let terminal = backend::DesktopBackend::new(
        manager.clone(),
        workspace,
        typing.clone(),
        vault,
        Default::default(),
    )
    .unwrap();
    let backend = shared_backend::SharedBackend {
        terminal,
        chats: chats.clone(),
        typing: typing.clone(),
    };
    let host = EmbeddedHost::start(
        std::path::Path::new(&state).join("phone"),
        SocketAddr::from(([127, 0, 0, 1], 0)),
        Arc::new(backend),
        "Shared Chat Probe Mac",
    )
    .unwrap();
    let address = format!("127.0.0.1:{}", host.status()["port"]);
    println!("listening on {address}");
    println!("{}", host.invite(&format!("ws://{address}")).unwrap());
    for line in std::io::stdin().lock().lines() {
        let line = line.unwrap();
        if let Some(key) = line.strip_prefix("approve ") {
            println!("approval {:?}", host.answer(key, true));
        } else if line == "typing off" {
            typing.store(false, Ordering::SeqCst);
        } else if line == "typing on" {
            typing.store(true, Ordering::SeqCst);
        } else if let Some(request) = line.strip_prefix("local ") {
            let request: Value = serde_json::from_str(request).unwrap();
            let result = chats.local(
                request["method"].as_str().unwrap(),
                request["params"].clone(),
            );
            println!(
                "local-result {}",
                match result {
                    Ok(value) => json!({"id":request["id"],"result":value}),
                    Err(error) => json!({"id":request["id"],"error":error}),
                }
            );
        }
    }
    chats.shutdown();
    manager.shutdown();
}
