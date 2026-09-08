use crate::{connection, state::Shared};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

struct Peer {
    input: connection::FrameSender,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Peer {
    fn drop(&mut self) {
        self.task.abort();
    }
}
struct Worker(tokio::task::JoinHandle<Result<(), String>>);
impl Drop for Worker {
    fn drop(&mut self) {
        self.0.abort();
    }
}

pub async fn maintain(shared: Arc<Shared>, url: String, token: String) {
    let mut delay = 1;
    loop {
        let started = tokio::time::Instant::now();
        if let Err(error) = connect(shared.clone(), &url, &token).await {
            eprintln!("Relay disconnected: {error}. Retrying in {delay}s.");
        }
        if started.elapsed() > Duration::from_secs(60) {
            delay = 1;
        }
        tokio::time::sleep(Duration::from_secs(delay)).await;
        delay = (delay * 2).min(30);
    }
}

async fn connect(shared: Arc<Shared>, url: &str, token: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "Invalid relay URL")?;
    if parsed.scheme() != "wss"
        && !(parsed.scheme() == "ws"
            && matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")))
    {
        return Err("Relay requires wss://; ws:// only permitted for loopback development".into());
    }
    let (mut socket, _) = tokio::time::timeout(Duration::from_secs(10), connect_async(url))
        .await
        .map_err(|_| "Relay connection timed out")?
        .map_err(|_| "Relay connection failed")?;
    let host_id = shared
        .identity
        .lock()
        .map_err(|_| "Identity unavailable")?
        .id();
    socket
        .send(Message::Text(
            json!({"type":"host.register","hostId":host_id,"token":token})
                .to_string()
                .into(),
        ))
        .await
        .map_err(|_| "Relay registration failed")?;
    let mut peers: HashMap<String, Peer> = HashMap::new();
    let (send, mut receive) = mpsc::channel::<Value>(128);
    let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
    let mut last_seen = tokio::time::Instant::now();
    loop {
        tokio::select! {
            message = socket.next() => {
                match message {
                    Some(Ok(Message::Text(text))) if text.len() <= 90_000 => {
                        last_seen = tokio::time::Instant::now();
                        let value: Value = serde_json::from_str(&text).map_err(|_| "Invalid relay envelope")?;
                        handle(value, &mut peers, &shared, &send)?;
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
                }
                let result = tokio::time::timeout(Duration::from_secs(10), socket.send(Message::Text(value.to_string().into()))).await;
                if !matches!(result, Ok(Ok(()))) { return Err("Relay send stalled".into()); }
            }
            _ = heartbeat.tick() => {
                if last_seen.elapsed() > Duration::from_secs(65) { return Err("Relay heartbeat timed out".into()); }
                socket.send(Message::Ping(Vec::new().into())).await.map_err(|_| "Relay closed")?;
            }
        }
    }
}

fn handle(
    value: Value,
    peers: &mut HashMap<String, Peer>,
    shared: &Arc<Shared>,
    send: &mpsc::Sender<Value>,
) -> Result<(), String> {
    let kind = value["type"]
        .as_str()
        .ok_or("Missing relay envelope type")?;
    if kind == "host.ready" {
        println!("Relay connected.");
        return Ok(());
    }
    if kind == "error" {
        return Err("Relay rejected request".into());
    }
    let id = value["clientId"]
        .as_str()
        .filter(|id| !id.is_empty() && id.len() <= 80)
        .ok_or("Invalid relay client ID")?;
    match kind {
        "client.open" => {
            if peers.len() >= 32 || peers.contains_key(id) {
                return Err("Relay client limit or duplicate ID".into());
            }
            let (input_send, input_receive) = mpsc::channel(32);
            let (output_send, mut output_receive) = mpsc::channel(32);
            let state = shared.clone();
            let outgoing = send.clone();
            let client_id = id.to_string();
            let task = tokio::spawn(async move {
                let worker = Worker(tokio::spawn(connection::run(
                    state,
                    input_receive,
                    output_send,
                )));
                while let Some(frame) = output_receive.recv().await {
                    if outgoing.send(json!({"type":"frame","clientId":client_id,"data":STANDARD.encode(frame)})).await.is_err() { break; }
                }
                worker.0.abort();
                let _ = outgoing
                    .send(json!({"type":"client.close","clientId":client_id}))
                    .await;
            });
            peers.insert(
                id.into(),
                Peer {
                    input: input_send,
                    task,
                },
            );
        }
        "frame" => {
            let data = value["data"].as_str().ok_or("Missing relay frame")?;
            let frame = STANDARD
                .decode(data)
                .map_err(|_| "Invalid relay frame encoding")?;
            if frame.len() > vibyra_transport::MAX_FRAME {
                return Err("Relay frame exceeds bounds".into());
            }
            if let Some(peer) = peers.get(id) {
                if peer.input.try_send(frame).is_err() {
                    peers.remove(id);
                }
            }
        }
        "client.close" => {
            peers.remove(id);
        }
        _ => return Err("Unknown relay message".into()),
    }
    Ok(())
}
