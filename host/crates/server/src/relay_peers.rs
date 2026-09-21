//! The phones a relay connection is carrying: one `connection::run` per relay
//! client id, fed by `frame` envelopes and answered through the shared sender.
use crate::{connection, state::Shared};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::mpsc;

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

pub struct Peers {
    shared: Arc<Shared>,
    outgoing: mpsc::Sender<Value>,
    peers: HashMap<String, Peer>,
}
impl Peers {
    pub fn new(shared: Arc<Shared>, outgoing: mpsc::Sender<Value>) -> Self {
        Self {
            shared,
            outgoing,
            peers: HashMap::new(),
        }
    }
    pub fn len(&self) -> usize {
        self.peers.len()
    }
    pub fn remove(&mut self, id: &str) {
        self.peers.remove(id);
    }
    /// Drops every phone and returns their ids, so the relay can be told.
    pub fn drain(&mut self) -> Vec<String> {
        self.peers.drain().map(|(id, _)| id).collect()
    }
    /// One envelope from the relay. Returns whether the relay has confirmed
    /// this computer's registration (which every later envelope implies).
    pub fn handle(&mut self, value: Value) -> Result<bool, String> {
        let kind = value["type"]
            .as_str()
            .ok_or("Missing relay envelope type")?;
        match kind {
            "host.ready" => return Ok(true),
            "error" => {
                return Err(value["message"]
                    .as_str()
                    .filter(|m| !m.is_empty() && m.len() <= 200)
                    .unwrap_or("Relay rejected request")
                    .to_string())
            }
            _ => {}
        }
        let id = value["clientId"]
            .as_str()
            .filter(|id| !id.is_empty() && id.len() <= 80)
            .ok_or("Invalid relay client ID")?;
        match kind {
            "client.open" => self.open(id)?,
            "frame" => {
                let data = value["data"].as_str().ok_or("Missing relay frame")?;
                let frame = STANDARD
                    .decode(data)
                    .map_err(|_| "Invalid relay frame encoding")?;
                if frame.len() > vibyra_transport::MAX_FRAME {
                    return Err("Relay frame exceeds bounds".into());
                }
                if let Some(peer) = self.peers.get(id) {
                    if peer.input.try_send(frame).is_err() {
                        self.peers.remove(id);
                    }
                }
            }
            "client.close" => {
                self.peers.remove(id);
            }
            _ => return Err("Unknown relay message".into()),
        }
        Ok(true)
    }
    fn open(&mut self, id: &str) -> Result<(), String> {
        if self.peers.len() >= 32 || self.peers.contains_key(id) {
            return Err("Relay client limit or duplicate ID".into());
        }
        let (input_send, input_receive) = mpsc::channel(32);
        let (output_send, mut output_receive) = mpsc::channel(32);
        let state = self.shared.clone();
        let outgoing = self.outgoing.clone();
        let client_id = id.to_string();
        let task = tokio::spawn(async move {
            let worker = Worker(tokio::spawn(connection::run(
                state,
                input_receive,
                output_send,
            )));
            while let Some(frame) = output_receive.recv().await {
                if outgoing
                    .send(
                        json!({"type":"frame","clientId":client_id,"data":STANDARD.encode(frame)}),
                    )
                    .await
                    .is_err()
                {
                    break;
                }
            }
            worker.0.abort();
            let _ = outgoing
                .send(json!({"type":"client.close","clientId":client_id}))
                .await;
        });
        self.peers.insert(
            id.into(),
            Peer {
                input: input_send,
                task,
            },
        );
        Ok(())
    }
}
