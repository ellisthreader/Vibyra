use super::*;

#[test]
fn delayed_upgrade_waits_on_an_accepted_nonblocking_listener() {
    let dir = tempfile::tempdir().unwrap();
    let listener = UnixListener::bind(dir.path().join("rpc.sock")).unwrap();
    listener.set_nonblocking(true).unwrap();
    let (connected, ready) = mpsc::sync_channel(1);
    let path = dir.path().join("rpc.sock");
    let client = std::thread::spawn(move || {
        let stream = UnixStream::connect(path).unwrap();
        connected.send(()).unwrap();
        std::thread::sleep(Duration::from_millis(40));
        tungstenite::client("ws://localhost/", stream).unwrap();
    });
    ready.recv().unwrap();
    let (stream, _) = listener.accept().unwrap();
    prepare_socket(&stream).unwrap();
    tungstenite::accept_with_config(stream, None).unwrap();
    client.join().unwrap();
}
