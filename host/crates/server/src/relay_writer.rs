//! The Cloud sink has one owner. Its bounded FIFO preserves Noise nonces while
//! pacing and slow socket writes leave the connection's reader free to run.
use futures_util::{Sink, SinkExt};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

pub(super) const CAPACITY: usize = 128;
pub(super) const CONTROL_CAPACITY: usize = 32;
pub(super) type Sessions = Arc<Mutex<HashSet<String>>>;

pub(super) async fn run<S>(
    mut sink: S,
    mut frames: mpsc::Receiver<Value>,
    mut controls: mpsc::Receiver<Message>,
    pacing_ms: Arc<AtomicU64>,
    sessions: Sessions,
) -> Result<(), String>
where
    S: Sink<Message> + Unpin,
{
    let mut next_frame = tokio::time::Instant::now();
    let mut pending: Option<Value> = None;
    let mut control_run = 0;
    loop {
        if pending.is_none() {
            if let Ok(value) = frames.try_recv() {
                pending = Some(value);
            }
        }
        let deadline = match pending.as_ref() {
            Some(value) if value["type"] == "frame" => next_frame,
            _ => tokio::time::Instant::now(),
        };
        // Only transport Ping/Pong use this lane. Encrypted terminal/Preview
        // frames cannot overtake one another after Noise assigns their nonce.
        let message = tokio::select! {
            biased;
            Some(message) = controls.recv(), if control_run < 8 || pending.is_none() => {
                control_run += 1;
                message
            }
            _ = tokio::time::sleep_until(deadline), if pending.is_some() => {
                let value = pending.take().expect("pending envelope");
                let id = value["clientId"].as_str().unwrap_or_default();
                if value["type"] == "frame" {
                    if !sessions.lock().map_err(|_| "Relay sessions unavailable")?.contains(id) {
                        continue;
                    }
                    next_frame = tokio::time::Instant::now()
                        + Duration::from_millis(pacing_ms.load(Ordering::Relaxed));
                }
                if value["type"] == "client.close" {
                    sessions.lock().map_err(|_| "Relay sessions unavailable")?.remove(id);
                }
                control_run = 0;
                Message::Text(value.to_string().into())
            }
            value = frames.recv(), if pending.is_none() => {
                let Some(value) = value else { return Ok(()) };
                pending = Some(value);
                continue;
            }
        };
        match tokio::time::timeout(Duration::from_secs(10), sink.send(message)).await {
            Ok(Ok(())) => {}
            _ => return Err("Relay send stalled".into()),
        }
    }
}

#[cfg(test)]
#[path = "relay_writer_tests.rs"]
mod tests;
