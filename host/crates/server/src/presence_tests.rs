use crate::{
    presence::intercept,
    state::Shared,
    test_support::{nearby_state, state},
};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

async fn ask(shared: Arc<Shared>, request: &str) -> (bool, String) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    // The server drops its stream once it has answered, so the client reads to
    // a real EOF instead of a cancelled timeout that would lose the buffer.
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        intercept(&mut stream, &shared).await
    });
    let mut client = TcpStream::connect(address).await.unwrap();
    client.write_all(request.as_bytes()).await.unwrap();
    let handled = server.await.unwrap();
    let mut reply = String::new();
    // An unhandled request is left for the WebSocket handshake, so this test
    // socket closes without draining it; that reset is expected here.
    let _ = client.read_to_string(&mut reply).await;
    (handled, reply)
}

#[tokio::test]
async fn a_discoverable_host_publishes_only_its_name_public_key_and_os_family() {
    let (_dir, shared) = nearby_state();
    let expected = shared.identity.lock().unwrap().id();
    let (handled, reply) = ask(shared, "GET /identity HTTP/1.1\r\nHost: x\r\n\r\n").await;
    assert!(handled);
    assert!(reply.starts_with("HTTP/1.1 200 OK"), "{reply}");
    let body = reply.split("\r\n\r\n").nth(1).unwrap_or_default();
    let value: serde_json::Value = serde_json::from_str(body).unwrap();
    assert_eq!(value["id"].as_str(), Some(expected.as_str()));
    assert_eq!(value["version"], 1);
    assert_eq!(value["platform"].as_str(), Some(std::env::consts::OS));
    assert_eq!(value.as_object().unwrap().len(), 4, "presence only: {body}");
    for secret in ["invite", "privateKey", "devices", "projects"] {
        assert!(value.get(secret).is_none(), "{secret} must never be served");
    }
}

#[tokio::test]
async fn a_private_host_admits_nothing_and_websockets_are_untouched() {
    let (_dir, quiet) = state();
    let (handled, reply) = ask(quiet, "GET /identity HTTP/1.1\r\n\r\n").await;
    assert!(handled);
    assert!(reply.starts_with("HTTP/1.1 404"), "{reply}");
    // A WebSocket upgrade is not intercepted, and its bytes stay buffered.
    let (_dir, shared) = nearby_state();
    let (handled, reply) = ask(shared, "GET / HTTP/1.1\r\nUpgrade: websocket\r\n\r\n").await;
    assert!(!handled, "the WebSocket path must be left alone");
    assert_eq!(reply, "");
}
