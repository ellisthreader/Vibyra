use crate::{identity::Identity, state::Shared};
use std::{
    collections::{BTreeMap, HashSet},
    sync::{Arc, Mutex},
};

pub fn state() -> (tempfile::TempDir, Arc<Shared>) {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("project");
    std::fs::create_dir(&project).unwrap();
    let identity = Identity::load(&dir.path().join("state"), Some("Test computer")).unwrap();
    let engine = Arc::new(
        vibyra_engine::Engine::new(dir.path().join("state"), vec![("Test".into(), project)])
            .unwrap(),
    );
    let shared = Arc::new(Shared {
        engine,
        identity: Mutex::new(identity),
        invitation: Mutex::new(None),
        pending: Mutex::new(BTreeMap::new()),
        active: Mutex::new(HashSet::new()),
        pairing_url: "ws://127.0.0.1:4318".into(),
        relay: false,
    });
    (dir, shared)
}

pub fn token(uri: &str) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    let data = uri.split("data=").nth(1).unwrap();
    let value: serde_json::Value =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(data).unwrap()).unwrap();
    value["invite"].as_str().unwrap().to_string()
}

pub async fn approve_when_pending(shared: Arc<Shared>, id: String) {
    for _ in 0..200 {
        if shared.pending.lock().unwrap().contains_key(&id) {
            shared.answer(&id, true).unwrap();
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    panic!("No pending local approval");
}
