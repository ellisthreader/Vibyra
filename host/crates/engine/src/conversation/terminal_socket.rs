use super::{
    runtime::Runtime,
    terminal_bridge::{BeforeRequest, Bridge},
    terminal_socket_serve::serve,
    terminal_socket_stream::AttachStream,
};
use serde_json::Value;
#[cfg(all(test, unix))]
use std::os::unix::net::UnixStream;
#[cfg(unix)]
use std::os::unix::{fs::PermissionsExt, net::UnixListener};
#[cfg(all(test, unix))]
use std::sync::mpsc;
use std::{sync::Arc, time::Duration};
use tungstenite::{
    handshake::server::{ErrorResponse, Request, Response},
    protocol::{WebSocket, WebSocketConfig},
};

/// The HTTP upgrade, then a live nonblocking socket. With `token` (Windows),
/// the upgrade must carry exactly that bearer secret or it is refused.
pub(super) fn upgrade<S: AttachStream>(
    stream: S,
    token: Option<&str>,
) -> Result<WebSocket<S>, String> {
    // Accepted sockets can inherit the listener's nonblocking mode. The HTTP
    // upgrade must finish before the live socket switches to nonblocking IO,
    // and must wait for Codex's upgrade request, which can arrive after accept.
    stream
        .for_handshake(Duration::from_secs(if cfg!(windows) { 15 } else { 2 }))
        .map_err(|e| e.to_string())?;
    let config = WebSocketConfig::default()
        .max_write_buffer_size(32 * 1024 * 1024)
        .max_message_size(Some(1024 * 1024))
        .max_frame_size(Some(1024 * 1024));
    // tungstenite fixes this callback's error type; it is built once per handshake.
    #[allow(clippy::result_large_err)]
    let check = |request: &Request, response: Response| -> Result<Response, ErrorResponse> {
        let header = request
            .headers()
            .get("authorization")
            .and_then(|v| v.to_str().ok());
        match token {
            Some(token) if !super::terminal_socket_stream::authorized(header, token) => {
                let mut refused = ErrorResponse::new(Some("Unauthorized".into()));
                *refused.status_mut() = tungstenite::http::StatusCode::UNAUTHORIZED;
                Err(refused)
            }
            _ => Ok(response),
        }
    };
    let mut socket = tungstenite::accept_hdr_with_config(stream, check, Some(config))
        .map_err(|e| e.to_string())?;
    socket.get_mut().go_live().map_err(|e| e.to_string())?;
    Ok(socket)
}

#[cfg(all(test, unix))]
fn prepare_socket(stream: &UnixStream) -> std::io::Result<()> {
    stream.for_handshake(Duration::from_secs(if cfg!(windows) { 15 } else { 2 }))
}

pub(super) fn start(
    runtime: &Arc<Runtime>,
    thread: String,
    initialize: Value,
    before: Arc<BeforeRequest>,
) -> Result<Arc<Bridge>, String> {
    let weak = Arc::downgrade(runtime);
    #[cfg(unix)]
    {
        // Short private path: macOS Unix sockets have a 104-byte path limit.
        let directory = tempfile::Builder::new()
            .prefix("vibyra-cli-")
            .tempdir_in("/tmp")
            .map_err(|e| e.to_string())?;
        std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
        let path = directory.path().join("rpc.sock");
        let listener = UnixListener::bind(&path).map_err(|e| e.to_string())?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let endpoint = format!("unix://{}", path.display());
        let bridge = Arc::new(Bridge::new(
            thread,
            initialize,
            before,
            endpoint,
            None,
            Some(directory),
        ));
        let weak_bridge = Arc::downgrade(&bridge);
        std::thread::spawn(move || {
            let accept = || listener.accept().map(|(stream, _)| stream);
            serve(
                weak,
                weak_bridge,
                accept,
                || wait_for_connection(&listener),
                None,
            );
        });
        Ok(bridge)
    }
    #[cfg(windows)]
    {
        // Loopback only, on a port chosen by the OS; the bearer secret travels to
        // Codex in an environment variable (`--remote-auth-token-env`).
        let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let token = super::terminal_socket_stream::token();
        let endpoint = format!("ws://127.0.0.1:{port}");
        let bridge = Arc::new(Bridge::new(
            thread,
            initialize,
            before,
            endpoint,
            Some(token.clone()),
            None,
        ));
        let weak_bridge = Arc::downgrade(&bridge);
        std::thread::spawn(move || {
            let accept = || listener.accept().map(|(stream, _)| stream);
            let idle = || std::thread::sleep(Duration::from_millis(100));
            serve(weak, weak_bridge, accept, idle, Some(token));
        });
        Ok(bridge)
    }
}

/// Sleeps until the CLI connects, or a quarter second passes so a stopped
/// runtime is still noticed. The bridge outlives a CLI that detached, and
/// waking forty times a second to ask kept every such runtime busy.
#[cfg(unix)]
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

#[cfg(all(test, unix))]
#[path = "terminal_socket_tests.rs"]
mod tests;

#[cfg(all(test, unix))]
#[path = "terminal_socket_delayed_tests.rs"]
mod delayed_upgrade_tests;
