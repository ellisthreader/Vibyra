//! One attached Codex TUI at a time: relays JSON-RPC between its WebSocket
//! and the Codex app-server runtime until either side goes away.
use super::{
    runtime::Runtime, terminal_bridge::Bridge, terminal_socket::upgrade,
    terminal_socket_stream::AttachStream,
};
use serde_json::{json, Value};
use std::{
    io::ErrorKind,
    sync::{mpsc, Weak},
    time::Duration,
};
use tungstenite::Message;

/// `accept` returns `WouldBlock` while nobody is connecting; `idle` then waits.
pub(super) fn serve<S: AttachStream>(
    weak: Weak<Runtime>,
    weak_bridge: Weak<Bridge>,
    mut accept: impl FnMut() -> std::io::Result<S>,
    idle: impl Fn(),
    token: Option<String>,
) {
    while let (Some(runtime), Some(bridge)) = (weak.upgrade(), weak_bridge.upgrade()) {
        if runtime.exited() {
            break;
        }
        match accept() {
            Ok(stream) => {
                let mut socket = match upgrade(stream, token.as_deref()) {
                    Ok(socket) => socket,
                    Err(error) => {
                        eprintln!("Codex CLI socket handshake failed: {error}");
                        continue;
                    }
                };
                let (tx, rx) = mpsc::sync_channel(256);
                *bridge.peer.lock() = Some(tx);
                drop(runtime);
                loop {
                    let Some(runtime) = weak.upgrade() else {
                        break;
                    };
                    if runtime.exited() || bridge.peer.lock().is_none() {
                        eprintln!("Codex CLI attachment ended: runtime stopped or output queue overflowed");
                        break;
                    }
                    let mut failed = false;
                    for value in rx.try_iter() {
                        if let Err(error) = socket.send(Message::Text(value.to_string().into())) {
                            // tungstenite retained this frame; retry flush, not send.
                            if matches!(&error, tungstenite::Error::Io(e) if e.kind() == ErrorKind::WouldBlock)
                            {
                                break;
                            }
                            eprintln!("Codex CLI socket send failed: {error}");
                            failed = true;
                            break;
                        }
                    }
                    if failed {
                        break;
                    }
                    if let Err(error) = socket.flush() {
                        if !matches!(&error, tungstenite::Error::Io(e) if e.kind() == ErrorKind::WouldBlock)
                        {
                            break;
                        }
                    }
                    match socket.read() {
                        Ok(Message::Text(text)) => {
                            let Ok(value) = serde_json::from_str::<Value>(&text) else {
                                eprintln!("Codex CLI sent invalid JSON");
                                break;
                            };
                            let id = value.get("id").cloned();
                            let result = bridge
                                .client(value)
                                .and_then(|v| v.map_or(Ok(()), |v| runtime.write(v)));
                            if let (Err(error), Some(id)) = (result, id) {
                                bridge
                                    .send(json!({"id":id,"error":{"code":-32000,"message":error}}));
                            }
                        }
                        Ok(Message::Close(_)) => break,
                        Err(tungstenite::Error::Io(e)) if e.kind() == ErrorKind::WouldBlock => {}
                        Err(error) => {
                            eprintln!("Codex CLI socket read failed: {error}");
                            break;
                        }
                        _ => {}
                    }
                    drop(runtime);
                    std::thread::sleep(Duration::from_millis(8));
                }
                bridge.detached();
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                drop(runtime);
                drop(bridge);
                idle();
            }
            Err(_) => break,
        }
    }
}
