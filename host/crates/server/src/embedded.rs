use crate::{backend::Backend, direct, discovery, identity::Identity, instance, state::Shared};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashSet},
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::oneshot;

/// A dedicated runtime makes stop/drop close all active sockets as well as the listener.
pub struct EmbeddedHost {
    shared: Arc<Shared>,
    stop: Option<oneshot::Sender<()>>,
    thread: Option<std::thread::JoinHandle<()>>,
    address: SocketAddr,
}
impl EmbeddedHost {
    pub fn start(
        path: PathBuf,
        address: SocketAddr,
        backend: Arc<dyn Backend>,
    ) -> Result<Self, String> {
        let lock = instance::lock(&path)?;
        let identity = Identity::load(&path, Some("Vibyra Desktop"))?;
        let socket = std::net::TcpListener::bind(address)
            .map_err(|e| format!("Cannot start phone connection: {e}"))?;
        socket.set_nonblocking(true).map_err(|e| e.to_string())?;
        let address = socket.local_addr().map_err(|e| e.to_string())?;
        let shared = Arc::new(Shared {
            engine: backend,
            identity: Mutex::new(identity),
            invitation: Mutex::new(None),
            pending: Mutex::new(BTreeMap::new()),
            active: Mutex::new(HashSet::new()),
            pairing_url: format!("ws://{address}"),
            relay: false,
        });
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;
        let (stop, receiver) = oneshot::channel();
        let state = shared.clone();
        let thread = std::thread::Builder::new()
            .name("vibyra-phone".into())
            .spawn(move || {
                let _lock = lock;
                runtime.block_on(async move {
                    let listener = tokio::net::TcpListener::from_std(socket)
                        .expect("validated nonblocking listener");
                    let _discovery = if address.ip().is_loopback() {
                        None
                    } else {
                        let identity = state.identity.lock().expect("identity");
                        discovery::Advertisement::start(&identity.name, &identity.id(), address)
                            .ok()
                    };
                    tokio::select! {
                        _ = receiver => {},
                        _ = direct::serve_with_policy(listener, state, true) => {},
                    }
                });
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            shared,
            stop: Some(stop),
            thread: Some(thread),
            address,
        })
    }
    pub fn invite(&self, url: &str) -> Result<String, String> {
        let uri = self.shared.invite(Some(url))?;
        if self.address.is_ipv4() {
            return Ok(uri);
        }
        // The phone keeps public ws endpoints blocked. This explicit marker is
        // only emitted by the embedded listener with its IPv6 LAN peer filter.
        let encoded = uri
            .strip_prefix("vibyra://pair?data=")
            .ok_or("Invalid invitation")?;
        let bytes = URL_SAFE_NO_PAD.decode(encoded).map_err(|e| e.to_string())?;
        let mut payload: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        payload["network"] = json!("lan");
        Ok(format!(
            "vibyra://pair?data={}",
            URL_SAFE_NO_PAD.encode(payload.to_string())
        ))
    }
    pub fn answer(&self, id: &str, approve: bool) -> Result<(), String> {
        self.shared.answer(id, approve)
    }
    pub fn revoke(&self, id: &str) -> Result<(), String> {
        self.shared.revoke(id)
    }
    pub fn status(&self) -> Value {
        let pending = self
            .shared
            .pending
            .lock()
            .map(|p| {
                p.iter()
                    .map(|(id, (name, _))| json!({"id":id,"name":name}))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let active = self
            .shared
            .active
            .lock()
            .map(|p| p.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        let devices = self
            .shared
            .identity
            .lock()
            .map(|p| p.devices.values().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        json!({"enabled":true,"port":self.address.port(),"pending":pending,"devices":devices,"active":active})
    }
}
impl Drop for EmbeddedHost {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
