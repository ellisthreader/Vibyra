//! A tiny local site for the Agent browser tests. It records every request
//! that reaches it (Host header, method, path, body) and every WebSocket
//! handshake (`WS-OPEN`) and text frame (`WS`), so a test can prove a blocked
//! origin, private address, unsafe method or socket frame never arrived.

use super::pages::page;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct Hit {
    pub host: String,
    pub method: String,
    pub path: String,
    pub body: String,
}

pub struct Site {
    pub port: u16,
    pub hits: Arc<Mutex<Vec<Hit>>>,
}

impl Site {
    pub fn hits_to(&self, host: &str) -> usize {
        let hits = self.hits.lock().unwrap();
        hits.iter().filter(|h| h.host.starts_with(host)).count()
    }

    pub fn find(&self, method: &str, path: &str) -> Option<Hit> {
        let hits = self.hits.lock().unwrap();
        hits.iter()
            .find(|h| h.method == method && h.path == path)
            .cloned()
    }

    /// Every WebSocket handshake and text frame that arrived.
    pub fn sockets(&self) -> Vec<Hit> {
        let hits = self.hits.lock().unwrap();
        let socket = |h: &&Hit| h.method == "WS" || h.method == "WS-OPEN";
        hits.iter().filter(socket).cloned().collect()
    }
}

type Log = Arc<Mutex<Vec<Hit>>>;

/// Answers a WebSocket upgrade with an echo, logging the handshake and frames.
#[allow(clippy::result_large_err)] // the handshake callback's error type is tungstenite's
fn socket(stream: TcpStream, log: Log) {
    use tungstenite::handshake::server::{ErrorResponse, Request, Response};
    let mut seen = (String::new(), String::new());
    let callback = |request: &Request, response: Response| -> Result<Response, ErrorResponse> {
        let host = request.headers().get("host").and_then(|h| h.to_str().ok());
        seen = (
            host.unwrap_or_default().to_owned(),
            request.uri().path().to_owned(),
        );
        Ok(response)
    };
    let Ok(mut ws) = tungstenite::accept_hdr(stream, callback) else {
        return;
    };
    let entry = |method: &str, body: String| Hit {
        host: seen.0.clone(),
        method: method.to_owned(),
        path: seen.1.clone(),
        body,
    };
    log.lock().unwrap().push(entry("WS-OPEN", String::new()));
    while let Ok(message) = ws.read() {
        if let tungstenite::Message::Text(text) = message {
            log.lock().unwrap().push(entry("WS", text.to_string()));
            let _ = ws.send(tungstenite::Message::Text(text));
        }
    }
}

/// True once the request head is in, and whether it asks for a WebSocket.
fn upgrade_requested(stream: &TcpStream) -> Option<bool> {
    let mut peeked = [0u8; 4096];
    for _ in 0..100 {
        let n = stream.peek(&mut peeked).ok().filter(|n| *n > 0)?;
        let text = String::from_utf8_lossy(&peeked[..n]).to_ascii_lowercase();
        if text.contains("\r\n\r\n") {
            return Some(text.contains("upgrade: websocket"));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    None
}

fn serve(mut stream: TcpStream, port: u16, log: Log) {
    match upgrade_requested(&stream) {
        None => return,
        Some(true) => return socket(stream, log),
        Some(false) => {}
    }
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    let end = loop {
        if let Some(end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break end + 4;
        }
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => return,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    };
    let head = String::from_utf8_lossy(&buf[..end]).to_string();
    let header = |name: &str| {
        head.lines().find_map(|l| {
            let (k, v) = l.split_once(':')?;
            k.eq_ignore_ascii_case(name).then(|| v.trim().to_owned())
        })
    };
    let length: usize = header("content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    while buf.len() < end + length {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    }
    let mut first = head.lines().next().unwrap_or_default().split(' ');
    let (method, path) = (
        first.next().unwrap_or("").to_owned(),
        first.next().unwrap_or("").to_owned(),
    );
    let body = String::from_utf8_lossy(&buf[end..]).to_string();
    log.lock().unwrap().push(Hit {
        host: header("host").unwrap_or_default(),
        method,
        path: path.clone(),
        body,
    });
    let (status, kind, body) = page(port, &path);
    let reply = match status {
        302 => format!("HTTP/1.1 302 Found\r\nLocation: {kind}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"),
        _ => format!(
            "HTTP/1.1 {status} X\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ),
    };
    let _ = stream.write_all(reply.as_bytes());
}

pub fn start() -> Site {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let hits: Log = Arc::default();
    let log = hits.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let log = log.clone();
            std::thread::spawn(move || serve(stream, port, log));
        }
    });
    Site { port, hits }
}
