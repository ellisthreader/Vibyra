//! The outbound leg to Vibyra Cloud. A computer connects *out* to the relay and
//! holds that socket; the relay then hands it phones as `client.open` /
//! `frame` / `client.close` envelopes, each phone becoming one ordinary
//! authenticated `connection::run` — the same Noise handshake, trust list and
//! approval queue as a phone on the LAN. Nothing about a terminal changes
//! because the bytes crossed the internet.
use crate::{relay_peers::Peers, state::Shared};
use futures_util::{future::BoxFuture, SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{mpsc, Notify};
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Where to connect and what to say: fetched fresh before every attempt, so a
/// token that expired while the computer was offline is never presented.
#[derive(Clone, Debug)]
pub struct RelayCredentials {
    pub url: String,
    pub token: String,
    /// What the relay is told this computer is called, for the phone's list.
    pub name: String,
}
pub type CredentialSource =
    Arc<dyn Fn() -> BoxFuture<'static, Result<RelayCredentials, String>> + Send + Sync>;

/// What the settings screen shows about the cloud leg.
#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayStatus {
    /// `waiting` (no credentials yet, e.g. signed out), `connecting`, `online`
    /// or `error`.
    pub state: String,
    pub error: Option<String>,
    pub clients: usize,
    pub relay: Option<String>,
}

/// The running leg. Dropping it ends the relay connection and every phone on it.
/// The standalone binary only holds one; Vibyra Desktop reads its status and
/// asks it to drop every phone.
#[cfg_attr(not(test), allow(dead_code))]
pub struct RelayHandle {
    status: Arc<Mutex<RelayStatus>>,
    drop_all: Arc<Notify>,
    task: tokio::task::JoinHandle<()>,
}
#[cfg_attr(not(test), allow(dead_code))]
impl RelayHandle {
    pub fn status(&self) -> RelayStatus {
        self.status.lock().map(|s| s.clone()).unwrap_or_default()
    }
    /// Ends every phone's session through the relay now; the relay connection
    /// itself stays, so the computer remains reachable.
    pub fn disconnect_all(&self) {
        self.drop_all.notify_one();
    }
}
impl Drop for RelayHandle {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Starts the leg on the current runtime.
pub fn start(shared: Arc<Shared>, source: CredentialSource) -> RelayHandle {
    let status = Arc::new(Mutex::new(RelayStatus {
        state: "connecting".into(),
        ..Default::default()
    }));
    let drop_all = Arc::new(Notify::new());
    let task = tokio::spawn(maintain(shared, source, status.clone(), drop_all.clone()));
    RelayHandle {
        status,
        drop_all,
        task,
    }
}

fn report(status: &Arc<Mutex<RelayStatus>>, state: &str, error: Option<String>, clients: usize) {
    if let Ok(mut current) = status.lock() {
        current.state = state.into();
        current.error = error;
        current.clients = clients;
    }
}

async fn maintain(
    shared: Arc<Shared>,
    source: CredentialSource,
    status: Arc<Mutex<RelayStatus>>,
    drop_all: Arc<Notify>,
) {
    let mut delay = 1;
    loop {
        let started = tokio::time::Instant::now();
        let outcome = match source().await {
            Ok(credentials) => {
                if let Ok(mut current) = status.lock() {
                    current.relay = Some(credentials.url.clone());
                }
                report(&status, "connecting", None, 0);
                connect(&shared, credentials, &status, &drop_all).await
            }
            // Nothing to connect with yet: signed out, or the API could not be
            // reached. Said as waiting, because it is not this leg's failure.
            Err(reason) => {
                report(&status, "waiting", Some(reason.clone()), 0);
                Err(reason)
            }
        };
        if let Err(error) = outcome {
            if status.lock().map(|s| s.state != "waiting").unwrap_or(true) {
                report(&status, "error", Some(error), 0);
            }
        }
        if started.elapsed() > Duration::from_secs(60) {
            delay = 1;
        }
        tokio::time::sleep(Duration::from_secs(delay)).await;
        delay = (delay * 2).min(30);
    }
}

async fn connect(
    shared: &Arc<Shared>,
    credentials: RelayCredentials,
    status: &Arc<Mutex<RelayStatus>>,
    drop_all: &Arc<Notify>,
) -> Result<(), String> {
    // rustls refuses to guess between crypto providers, and a process that has
    // two in its dependency graph (Vibyra Desktop does) panics at the first
    // wss:// dial without this. Installing twice is a harmless Err.
    static PROVIDER: std::sync::Once = std::sync::Once::new();
    PROVIDER.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
    let parsed = url::Url::parse(&credentials.url).map_err(|_| "Invalid relay URL")?;
    if parsed.scheme() != "wss"
        && !(parsed.scheme() == "ws"
            && matches!(
                parsed.host_str(),
                Some("127.0.0.1" | "localhost" | "[::1]" | "::1")
            ))
    {
        return Err("Relay requires wss://; ws:// only permitted for loopback development".into());
    }
    let (mut socket, _) =
        tokio::time::timeout(Duration::from_secs(10), connect_async(&credentials.url))
            .await
            .map_err(|_| "Relay connection timed out")?
            .map_err(|_| "Relay connection failed")?;
    let host_id = shared
        .identity
        .lock()
        .map_err(|_| "Identity unavailable")?
        .id();
    let register = json!({"type":"host.register","hostId":host_id,"token":credentials.token,"name":credentials.name});
    socket
        .send(Message::Text(register.to_string().into()))
        .await
        .map_err(|_| "Relay registration failed")?;
    let (send, mut receive) = mpsc::channel::<Value>(128);
    let mut peers = Peers::new(shared.clone(), send);
    let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
    let mut last_seen = tokio::time::Instant::now();
    // Older deployed relays count every encrypted frame against a 120/s
    // envelope limit. Pace this shared socket so a large Preview response does
    // not disconnect the computer and its terminal sessions.
    let mut next_frame_send = tokio::time::Instant::now();
    loop {
        tokio::select! {
            message = socket.next() => {
                match message {
                    Some(Ok(Message::Text(text))) if text.len() <= 90_000 => {
                        last_seen = tokio::time::Instant::now();
                        let value: Value = serde_json::from_str(&text).map_err(|_| "Invalid relay envelope")?;
                        let online = peers.handle(value)?;
                        report(status, if online { "online" } else { "connecting" }, None, peers.len());
                    }
                    Some(Ok(Message::Ping(bytes))) => {
                        last_seen = tokio::time::Instant::now();
                        socket.send(Message::Pong(bytes)).await.map_err(|_| "Relay closed")?;
                    }
                    Some(Ok(Message::Pong(_))) => { last_seen = tokio::time::Instant::now(); }
                    _ => return Err("Relay connection closed".into()),
                }
            }
            Some(value) = receive.recv() => {
                if value["type"] == "client.close" {
                    if let Some(id) = value["clientId"].as_str() { peers.remove(id); }
                    report(status, "online", None, peers.len());
                }
                if value["type"] == "frame" {
                    tokio::time::sleep_until(next_frame_send).await;
                    next_frame_send = tokio::time::Instant::now() + Duration::from_millis(12);
                }
                let result = tokio::time::timeout(Duration::from_secs(10), socket.send(Message::Text(value.to_string().into()))).await;
                if !matches!(result, Ok(Ok(()))) { return Err("Relay send stalled".into()); }
            }
            _ = drop_all.notified() => {
                for id in peers.drain() {
                    let _ = socket.send(Message::Text(json!({"type":"client.close","clientId":id}).to_string().into())).await;
                }
                report(status, "online", None, 0);
            }
            _ = heartbeat.tick() => {
                if last_seen.elapsed() > Duration::from_secs(65) { return Err("Relay heartbeat timed out".into()); }
                socket.send(Message::Ping(Vec::new().into())).await.map_err(|_| "Relay closed")?;
            }
        }
    }
}
