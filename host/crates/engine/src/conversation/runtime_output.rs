use super::{
    runtime::{Replies, RpcError},
    terminal_bridge::Bridge,
};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read},
    process::ChildStdout,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

pub(super) fn start(
    output: ChildStdout,
    replies: Replies,
    bridge: Arc<Mutex<Option<Arc<Bridge>>>>,
    closed: Arc<AtomicBool>,
    event: impl Fn(Value) + Send + 'static,
) {
    let events = super::batching::dispatch(event);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        loop {
            let mut line = Vec::new();
            // Native CLI bootstrap includes the account's plugin/config catalogue.
            // The local attachment has a separate, still bounded frame allowance.
            let read = reader
                .by_ref()
                .take(16 * 1024 * 1024)
                .read_until(b'\n', &mut line);
            if !matches!(read, Ok(n) if n > 0) || line.last() != Some(&b'\n') {
                eprintln!(
                    "Codex output ended or exceeded its frame limit ({} bytes)",
                    line.len()
                );
                break;
            }
            if line.len() > 1024 * 1024 && bridge.lock().is_none() {
                break;
            }
            let Ok(value) = serde_json::from_slice::<Value>(&line) else {
                break;
            };
            let attachment = bridge.lock().clone();
            if attachment.is_some_and(|b| b.provider(&value)) {
                continue;
            }
            if value.get("method").is_none() {
                if let Some(id) = value["id"].as_str() {
                    if let Some(tx) = replies.lock().remove(id) {
                        let result = if value.get("error").is_some() {
                            Err(RpcError {
                                unknown: false,
                                message: value["error"]["message"]
                                    .as_str()
                                    .unwrap_or("Codex request failed")
                                    .to_owned(),
                            })
                        } else {
                            Ok(value["result"].clone())
                        };
                        let _ = tx.send(result);
                    }
                }
            } else if events.send(value).is_err() {
                break;
            }
        }
        closed.store(true, Ordering::Release);
        for (_, tx) in replies.lock().drain() {
            let _ = tx.send(Err(RpcError::unknown("Codex connection ended")));
        }
        let _ = events.send(json!({"method":"vibyra/processExited"}));
    });
}
