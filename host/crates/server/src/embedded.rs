use crate::{
    backend::Backend, direct, discovery_watch, identity::Identity, instance, state::Shared,
};
use std::{
    collections::{BTreeMap, HashMap},
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::oneshot;

/// The longest stopping waits for work already handed to the blocking pool.
const SHUTDOWN: std::time::Duration = std::time::Duration::from_millis(1000);

/// A dedicated runtime makes stop/drop close all active sockets as well as the listener.
pub struct EmbeddedHost {
    pub(crate) shared: Arc<Shared>,
    stop: Option<oneshot::Sender<()>>,
    thread: Option<std::thread::JoinHandle<()>>,
    pub(crate) address: SocketAddr,
    pub(crate) discovery: Arc<Mutex<discovery_watch::Status>>,
    /// The listener's own runtime, so the cloud leg runs beside it and ends
    /// with it.
    pub(crate) runtime: tokio::runtime::Handle,
}
impl EmbeddedHost {
    /// `name` is what a nearby phone lists this computer as, so it should be
    /// the machine's own name rather than the product's.
    pub fn start(
        path: PathBuf,
        address: SocketAddr,
        backend: Arc<dyn Backend>,
        name: &str,
    ) -> Result<Self, String> {
        let lock = instance::lock(&path)?;
        let identity = Identity::load(&path, Some(name))?;
        let socket = std::net::TcpListener::bind(address)
            .map_err(|e| format!("Cannot start phone connection: {e}"))?;
        socket.set_nonblocking(true).map_err(|e| e.to_string())?;
        let address = socket.local_addr().map_err(|e| e.to_string())?;
        // A phone on this very machine — an iOS Simulator, which shares the
        // Mac's network stack — reaches it as 127.0.0.1 and would otherwise
        // never see a listener pinned to one LAN address. Loopback adds no
        // network exposure: nothing off this machine can reach it. Best
        // effort, because the port may already be taken.
        let local = companion_loopback(address).and_then(|extra| {
            let socket = std::net::TcpListener::bind(extra).ok()?;
            socket.set_nonblocking(true).ok()?;
            Some(socket)
        });
        let shared = Arc::new(Shared {
            engine: backend,
            identity: Mutex::new(identity),
            writes: Mutex::new(()),
            invitation: Mutex::new(None),
            pending: Mutex::new(BTreeMap::new()),
            active: Mutex::new(HashMap::new()),
            pairing_url: format!("ws://{address}"),
            relay: false,
            // This listener exists only for phone connections and already
            // restricts peers, so a phone that reaches it may ask without a
            // code even where Bonjour cannot advertise a loopback address.
            nearby: true,
        });
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;
        let handle = runtime.handle().clone();
        let (stop, receiver) = oneshot::channel();
        let discovery = Arc::new(Mutex::new(discovery_watch::Status::default()));
        let discovery_state = discovery.clone();
        let state = shared.clone();
        let extra = shared.clone();
        let thread = std::thread::Builder::new()
            .name("vibyra-phone".into())
            .spawn(move || {
                let _lock = lock;
                runtime.block_on(async move {
                    let listener = tokio::net::TcpListener::from_std(socket)
                        .expect("validated nonblocking listener");
                    let loopback =
                        local.and_then(|socket| tokio::net::TcpListener::from_std(socket).ok());
                    let also = async {
                        match loopback {
                            Some(listener) => {
                                direct::serve_with_policy(listener, extra, true).await
                            }
                            // Nothing to serve: never resolve, so `select!`
                            // keeps waiting on the real listener and the stop.
                            None => std::future::pending().await,
                        }
                    };
                    let (name, id) = {
                        let identity = state.identity.lock().expect("identity");
                        (identity.name.clone(), identity.id())
                    };
                    tokio::select! {
                        _ = receiver => {},
                        _ = discovery_watch::maintain(name, id, address, discovery_state) => {},
                        _ = direct::serve_with_policy(listener, state, true) => {},
                        _ = also => {},
                    }
                });
                // A plain drop waits for every request still in the blocking
                // pool, and one phone request can take many seconds while the
                // desktop waits on this thread to start the next host. Those
                // requests hold only `Shared`, and their replies have nowhere
                // left to go, so they are left to finish on their own. The
                // sockets and tasks are gone once this returns, before `_lock`
                // is released for the host that replaces this one.
                runtime.shutdown_timeout(SHUTDOWN);
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            shared,
            stop: Some(stop),
            thread: Some(thread),
            address,
            discovery,
            runtime: handle,
        })
    }
    /// Connects this computer outward to Vibyra Cloud so phones of the same
    /// account reach these very terminals from any network. The same trust
    /// list and approval queue apply; see `relay.rs`.
    pub fn relay(&self, source: crate::CredentialSource) -> crate::RelayHandle {
        let _runtime = self.runtime.enter();
        crate::relay::start(self.shared.clone(), source)
    }
}
/// The loopback address to also accept on, when the real listener is pinned to
/// some other address. Loopback listeners need no companion of their own.
pub(crate) fn companion_loopback(address: SocketAddr) -> Option<SocketAddr> {
    if address.ip().is_loopback() || address.port() == 0 {
        return None;
    }
    Some(SocketAddr::from((
        if address.is_ipv6() {
            std::net::IpAddr::V6(std::net::Ipv6Addr::LOCALHOST)
        } else {
            std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)
        },
        address.port(),
    )))
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
