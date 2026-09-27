use super::headers::request_url;
use super::Binding;
use base64::{engine::general_purpose::STANDARD, Engine};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;
use vibyra_host::{UpgradeRequest, UpgradeResponse};

pub(super) fn connect(
    binding: &Binding,
    request: &UpgradeRequest,
) -> Result<(TcpStream, UpgradeResponse), String> {
    request.validate()?;
    request_url(&binding.origin, &request.path)?;
    let port = binding.origin.port().ok_or("Preview port missing")?;
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut socket =
        TcpStream::connect_timeout(&address, Duration::from_secs(3)).map_err(|e| e.to_string())?;
    socket
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;
    socket
        .set_write_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;
    let key = header(&request.headers, "sec-websocket-key").ok_or("Missing WebSocket key")?;
    let host = format!("127.0.0.1:{port}");
    let mut wire = format!(
        "GET {} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\n",
        request.path
    );
    for wanted in [
        "origin",
        "cookie",
        "authorization",
        "user-agent",
        "sec-websocket-protocol",
    ] {
        if let Some(value) = header(&request.headers, wanted) {
            let value = if wanted == "origin" {
                binding.origin.origin().ascii_serialization()
            } else {
                value.to_owned()
            };
            wire.push_str(wanted);
            wire.push_str(": ");
            wire.push_str(&value);
            wire.push_str("\r\n");
        }
    }
    wire.push_str("\r\n");
    socket
        .write_all(wire.as_bytes())
        .map_err(|e| e.to_string())?;
    let response = read_response(&mut socket, key, request)?;
    socket
        .set_read_timeout(Some(Duration::from_millis(500)))
        .map_err(|e| e.to_string())?;
    socket
        .set_write_timeout(Some(Duration::from_millis(500)))
        .map_err(|e| e.to_string())?;
    Ok((socket, response))
}

fn read_response(
    socket: &mut TcpStream,
    key: &str,
    request: &UpgradeRequest,
) -> Result<UpgradeResponse, String> {
    let mut bytes = Vec::new();
    let mut one = [0u8; 1];
    while bytes.len() < 16 * 1024 {
        socket.read_exact(&mut one).map_err(|e| e.to_string())?;
        bytes.push(one[0]);
        if bytes.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    if !bytes.ends_with(b"\r\n\r\n") {
        return Err("Preview WebSocket handshake too large".into());
    }
    let text = std::str::from_utf8(&bytes).map_err(|_| "Invalid Preview WebSocket response")?;
    let mut lines = text.split("\r\n");
    let status = lines.next().ok_or("Preview WebSocket status missing")?;
    if !status.starts_with("HTTP/1.1 101 ") {
        return Err("Preview upstream did not upgrade".into());
    }
    let mut all = HashMap::new();
    for line in lines.take_while(|line| !line.is_empty()) {
        let (name, value) = line
            .split_once(':')
            .ok_or("Invalid Preview WebSocket header")?;
        if all
            .insert(name.to_ascii_lowercase(), value.trim().to_owned())
            .is_some()
        {
            return Err("Duplicate Preview WebSocket header".into());
        }
    }
    let expected = STANDARD.encode(Sha1::digest(
        format!("{key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11").as_bytes(),
    ));
    if all.get("sec-websocket-accept") != Some(&expected) {
        return Err("Preview WebSocket accept mismatch".into());
    }
    if let Some(chosen) = all.get("sec-websocket-protocol") {
        let offered = header(&request.headers, "sec-websocket-protocol").unwrap_or("");
        if !offered.split(',').any(|item| item.trim() == chosen) {
            return Err("Preview WebSocket protocol was not offered".into());
        }
    }
    if all.contains_key("sec-websocket-extensions") {
        return Err("Preview WebSocket extension was not offered".into());
    }
    let mut headers = HashMap::new();
    for wanted in [
        "upgrade",
        "connection",
        "sec-websocket-accept",
        "sec-websocket-protocol",
    ] {
        if let Some(value) = all.remove(wanted) {
            headers.insert(wanted.into(), value);
        }
    }
    let response = UpgradeResponse {
        v: 1,
        status: 101,
        headers,
    };
    response.validate()?;
    Ok(response)
}

fn header<'a>(headers: &'a HashMap<String, String>, wanted: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(wanted))
        .map(|(_, value)| value.as_str())
}
