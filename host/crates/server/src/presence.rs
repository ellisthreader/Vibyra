use crate::state::Shared;
use std::{sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

/// The same presence a discoverable Host publishes over Bonjour, answered over
/// plain HTTP on the listener it already owns.
///
/// A client that cannot browse Bonjour — any build without the native module —
/// can then find this Host by asking its address directly and still receive the
/// static public key it needs to authenticate the Noise handshake. It carries
/// nothing Bonjour does not (the OS family is the same `os` the TXT record
/// carries): no invitation, device key, credential or project data, and it is
/// only answered where discovery is already enabled.
const PATH: &[u8] = b"GET /identity ";

/// Peeked, never consumed: a WebSocket client's bytes stay untouched for the
/// handshake that follows.
pub async fn intercept(stream: &mut TcpStream, shared: &Arc<Shared>) -> bool {
    let mut head = [0u8; PATH.len()];
    let peeked = tokio::time::timeout(Duration::from_secs(2), peek_exact(stream, &mut head)).await;
    if !matches!(peeked, Ok(true)) || head != PATH {
        return false;
    }
    let body = if shared.nearby {
        shared
            .identity
            .lock()
            .map(|identity| {
                serde_json::json!({"version":1,"id":identity.id(),"name":identity.name,
                    "platform":std::env::consts::OS})
                .to_string()
            })
            .unwrap_or_default()
    } else {
        String::new()
    };
    // A Host that is not discoverable admits nothing at all.
    let response = if body.is_empty() {
        "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string()
    } else {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
    };
    let _ = tokio::time::timeout(Duration::from_secs(2), async {
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.flush().await;
        // Consume the request that was only peeked, then close with a FIN.
        // Dropping a socket with unread bytes resets it, and the client would
        // lose the reply it had just been sent.
        let mut sink = [0u8; 2048];
        let _ = tokio::time::timeout(Duration::from_millis(250), stream.read(&mut sink)).await;
        let _ = stream.shutdown().await;
    })
    .await;
    true
}

/// `peek` can return a short read while the request is still arriving.
async fn peek_exact(stream: &TcpStream, buf: &mut [u8]) -> bool {
    loop {
        match stream.peek(buf).await {
            Ok(count) if count == buf.len() => return true,
            Ok(0) => return false,
            Ok(_) => tokio::time::sleep(Duration::from_millis(15)).await,
            Err(_) => return false,
        }
    }
}
