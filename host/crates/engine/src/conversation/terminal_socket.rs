use super::{
    runtime::Runtime,
    terminal_bridge::{BeforeRequest, Bridge},
};
use serde_json::{json, Value};
use std::{
    io::ErrorKind,
    os::unix::{fs::PermissionsExt, net::UnixListener},
    sync::{mpsc, Arc},
    time::Duration,
};
use tungstenite::{protocol::WebSocketConfig, Message};

pub(super) fn start(
    runtime: &Arc<Runtime>,
    thread: String,
    initialize: Value,
    before: Arc<BeforeRequest>,
) -> Result<Arc<Bridge>, String> {
    // Short private path: macOS Unix sockets have a 104-byte path limit.
    let directory = tempfile::Builder::new()
        .prefix("vibyra-cli-")
        .tempdir_in("/tmp")
        .map_err(|e| e.to_string())?;
    std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700))
        .map_err(|e| e.to_string())?;
    let listener =
        UnixListener::bind(directory.path().join("rpc.sock")).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let bridge = Arc::new(Bridge::new(thread, initialize, before, directory));
    let weak = Arc::downgrade(runtime);
    let weak_bridge = Arc::downgrade(&bridge);
    std::thread::spawn(move || {
        while let (Some(runtime), Some(bridge)) = (weak.upgrade(), weak_bridge.upgrade()) {
            if runtime.exited() {
                break;
            }
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
                    let config = WebSocketConfig::default()
                        .max_write_buffer_size(32 * 1024 * 1024)
                        .max_message_size(Some(1024 * 1024))
                        .max_frame_size(Some(1024 * 1024));
                    if let Ok(mut socket) = tungstenite::accept_with_config(stream, Some(config)) {
                        let _ = socket.get_mut().set_nonblocking(true);
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
                                if let Err(error) =
                                    socket.send(Message::Text(value.to_string().into()))
                                {
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
                                        bridge.send(json!({"id":id,"error":{"code":-32000,"message":error}}));
                                    }
                                }
                                Ok(Message::Close(_)) => break,
                                Err(tungstenite::Error::Io(e))
                                    if e.kind() == ErrorKind::WouldBlock => {}
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
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => {
                    drop(runtime);
                    drop(bridge);
                    wait_for_connection(&listener);
                }
                Err(_) => break,
            }
        }
    });
    Ok(bridge)
}

/// Sleeps until the CLI connects, or a quarter second passes so a stopped
/// runtime is still noticed. The bridge outlives a CLI that detached, and
/// waking forty times a second to ask kept every such runtime busy.
fn wait_for_connection(listener: &UnixListener) {
    use std::os::fd::AsRawFd;
    let mut wanted = libc::pollfd {
        fd: listener.as_raw_fd(),
        events: libc::POLLIN,
        revents: 0,
    };
    // SAFETY: one initialized pollfd, for a descriptor this thread owns.
    let ready = unsafe { libc::poll(&mut wanted, 1, 250) };
    // An interrupted or failed wait falls back to the short sleep it replaced
    // rather than spinning.
    if ready < 0 || (ready > 0 && wanted.revents & libc::POLLIN == 0) {
        std::thread::sleep(Duration::from_millis(25));
    }
}
