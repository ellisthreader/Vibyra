use crate::{direct, discovery_watch, embedded::companion_loopback, state::Shared};
use std::{
    net::{SocketAddr, TcpListener as StdListener},
    sync::{Arc, Mutex},
};
use tokio::{
    net::TcpListener,
    sync::{mpsc, oneshot},
};

/// A bound, nonblocking socket is prepared before replacing the current
/// listener, so an unavailable new interface never interrupts live phones.
pub(crate) struct Rebind {
    pub listener: TcpListener,
    pub address: SocketAddr,
}

pub(crate) async fn serve(
    socket: StdListener,
    local: Option<StdListener>,
    state: Arc<Shared>,
    discovery: Arc<Mutex<discovery_watch::Status>>,
    mut stop: oneshot::Receiver<()>,
    mut changes: mpsc::UnboundedReceiver<Rebind>,
) {
    let mut address = socket.local_addr().expect("validated listener");
    let mut listener = TcpListener::from_std(socket).expect("validated nonblocking listener");
    let mut companion = local.and_then(|socket| TcpListener::from_std(socket).ok());
    let (name, id) = {
        let identity = state.identity.lock().expect("identity");
        (identity.name.clone(), identity.id())
    };
    loop {
        let change = {
            let main = direct::serve_with_policy(listener, state.clone(), true);
            let extra = state.clone();
            let also = async {
                match companion {
                    Some(listener) => direct::serve_with_policy(listener, extra, true).await,
                    None => std::future::pending().await,
                }
            };
            tokio::select! {
                _ = &mut stop => None,
                change = changes.recv() => change,
                _ = discovery_watch::maintain(name.clone(), id.clone(), address, discovery.clone()) => None,
                _ = main => None,
                _ = also => None,
            }
        };
        let Some(change) = change else { break };
        // Dropping the old accept loops leaves already spawned, authenticated
        // phone connections alive on the same Shared state and runtime.
        address = change.address;
        listener = change.listener;
        companion = companion_loopback(address)
            .and_then(|extra| StdListener::bind(extra).ok())
            .and_then(|socket| {
                socket.set_nonblocking(true).ok()?;
                TcpListener::from_std(socket).ok()
            });
        if let Ok(mut status) = discovery.lock() {
            status.advertised = false;
            status.error = None;
        }
    }
}
