use super::upgrade;
use std::{
    io::{Read, Write},
    os::unix::net::{UnixListener, UnixStream},
    time::Duration,
};

#[test]
fn upgrade_waits_for_a_fragmented_request_on_a_nonblocking_accepted_socket() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rpc.sock");
    let listener = UnixListener::bind(&path).unwrap();
    let server = std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        stream.set_nonblocking(true).unwrap();
        upgrade(stream).expect("a partial handshake must stay connected");
    });
    let mut client = UnixStream::connect(path).unwrap();
    client
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    client
        .write_all(b"GET /rpc HTTP/1.1\r\nHost: localhost\r\n")
        .unwrap();
    std::thread::sleep(Duration::from_millis(30));
    client.write_all(b"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n").unwrap();
    let mut response = [0; 512];
    let read = client.read(&mut response).unwrap();
    assert!(String::from_utf8_lossy(&response[..read]).contains("101 Switching Protocols"));
    server.join().unwrap();
}
