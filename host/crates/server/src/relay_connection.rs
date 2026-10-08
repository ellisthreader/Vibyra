//! A Cloud connection polls its reader independently from bounded writes.
use crate::{
    relay::{report, RelayCredentials, RelayStatus},
    relay_peers::Peers,
    state::Shared,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::sync::{mpsc, Notify};
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub(super) async fn connect(
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
    crate::relay_address::validate(&credentials.url)?;
    if credentials.allow_unsigned_loopback {
        if !crate::relay_address::is_loopback_diagnostic(&credentials.url) {
            return Err("Unsigned diagnostics require a loopback relay".into());
        }
    } else if credentials.authorization_key.is_none() || credentials.authorization_context.is_none()
    {
        return Err("Remote security verification key and account binding are required".into());
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
    tokio::time::timeout(
        Duration::from_secs(10),
        socket.send(Message::Text(register.to_string().into())),
    )
    .await
    .map_err(|_| "Relay registration timed out")?
    .map_err(|_| "Relay registration failed")?;
    let (send, mut receive) = mpsc::channel::<Value>(128);
    let mut peers = Peers::new(
        shared.clone(),
        send,
        credentials.authorization_key,
        credentials.authorization_context,
    );
    if credentials.allow_unsigned_loopback {
        peers.enable_loopback_diagnostics(&credentials.url)?;
    }
    let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
    let mut last_seen = tokio::time::Instant::now();
    // Older deployed relays count every encrypted frame against a 120/s
    // envelope limit. Pace this shared socket so a large Preview response does
    // not disconnect the computer and its terminal sessions.
    let pacing_ms = Arc::new(AtomicU64::new(12));
    let (sink, mut incoming) = socket.split();
    let (outgoing, writes) = mpsc::channel(crate::relay_writer::CAPACITY);
    let (control, controls) = mpsc::channel(crate::relay_writer::CONTROL_CAPACITY);
    let sessions = Arc::new(Mutex::new(std::collections::HashSet::new()));
    // This future is owned by connect: dropping/aborting the connection drops
    // the sink and queued frames too, never a detached writer or replay queue.
    let writer =
        crate::relay_writer::run(sink, writes, controls, pacing_ms.clone(), sessions.clone());
    tokio::pin!(writer);
    loop {
        tokio::select! {
            result = &mut writer => { return result; }
            message = incoming.next() => {
                match message {
                    Some(Ok(Message::Text(text))) if text.len() <= 90_000 => {
                        last_seen = tokio::time::Instant::now();
                        let value: Value = serde_json::from_str(&text).map_err(|_| "Invalid relay envelope")?;
                        if value["type"] == "host.ready" && value["previewPacingMs"] == 3 {
                            pacing_ms.store(3, Ordering::Relaxed);
                        }
                        if let Some(id) = value["clientId"].as_str() {
                            let mut live = sessions.lock().map_err(|_| "Relay sessions unavailable")?;
                            if value["type"] == "client.open" { live.insert(id.to_owned()); }
                            if value["type"] == "client.close" { live.remove(id); }
                        }
                        let peer_id = value["clientId"].as_str().map(str::to_owned);
                        let relay_error = value["type"] == "error";
                        let online = match peers.handle(value) {
                            Ok(online) => online,
                            // One phone's envelope (a renewal that arrived after it
                            // left, a refused grant, a duplicate id) ends that phone
                            // alone. Returning it here ended the whole leg, and with
                            // it every other phone on this computer, about once a
                            // minute when lease renewals raced a closing client.
                            Err(error) if !relay_error && peer_id.is_some() => {
                                let id = peer_id.clone().unwrap_or_default();
                                eprintln!("Relay client {id} closed: {error}");
                                peers.remove(&id);
                                outgoing.try_send(json!({"type":"client.close","clientId":id})).map_err(|_| "Relay output queue is full")?;
                                true
                            }
                            Err(error) => return Err(error),
                        };
                        if let Some(id) = peer_id.filter(|id| !peers.contains(id)) {
                            sessions.lock().map_err(|_| "Relay sessions unavailable")?.remove(&id);
                        }
                        report(status, if online { "online" } else { "connecting" }, None, peers.len());
                    }
                    Some(Ok(Message::Ping(bytes))) => {
                        last_seen = tokio::time::Instant::now();
                        control.try_send(Message::Pong(bytes)).map_err(|_| "Relay control queue is full")?;
                    }
                    Some(Ok(Message::Pong(_))) => { last_seen = tokio::time::Instant::now(); }
                    _ => return Err("Relay connection closed".into()),
                }
            }
            Some(value) = receive.recv(), if outgoing.capacity() > 0 => {
                if value["type"] == "client.close" {
                    if let Some(id) = value["clientId"].as_str() { peers.remove(id); }
                    report(status, "online", None, peers.len());
                }
                outgoing.try_send(value).map_err(|_| "Relay output queue is full")?;
            }
            _ = drop_all.notified() => {
                sessions.lock().map_err(|_| "Relay sessions unavailable")?.clear();
                for id in peers.drain() {
                    outgoing.try_send(json!({"type":"client.close","clientId":id})).map_err(|_| "Relay output queue is full")?;
                }
                report(status, "online", None, 0);
            }
            _ = heartbeat.tick() => {
                if last_seen.elapsed() > Duration::from_secs(65) { return Err("Relay heartbeat timed out".into()); }
                control.try_send(Message::Ping(Vec::new().into())).map_err(|_| "Relay control queue is full")?;
            }
        }
    }
}
