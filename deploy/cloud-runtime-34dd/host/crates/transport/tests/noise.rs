use vibyra_transport::{
    generate_keypair, read_handshake, responder, write_handshake, Channel, Client,
};

fn connected() -> (Client, Channel) {
    let host = generate_keypair().unwrap();
    let phone = generate_keypair().unwrap();
    let mut client = Client::new(&phone[..32], &host[32..]).unwrap();
    let mut server = responder(&host[..32]).unwrap();
    assert_eq!(
        read_handshake(&mut server, &client.start(b"hello").unwrap()).unwrap(),
        b"hello"
    );
    assert_eq!(server.get_remote_static().unwrap(), &phone[32..]);
    let reply = write_handshake(&mut server, b"approved").unwrap();
    assert_eq!(client.finish(&reply).unwrap(), b"approved");
    (client, Channel::from_handshake(server).unwrap())
}

#[test]
fn encrypted_roundtrip_and_replay_rejection() {
    let (mut client, mut server) = connected();
    let frame = client.encrypt(b"private command").unwrap();
    assert!(!frame.windows(7).any(|slice| slice == b"private"));
    assert_eq!(server.decrypt(&frame).unwrap(), b"private command");
    assert!(server.decrypt(&frame).is_err());
    let reply = server.encrypt(b"host output").unwrap();
    assert_eq!(client.decrypt(&reply).unwrap(), b"host output");
}

#[test]
fn wrong_host_key_tampering_and_bounds_fail_closed() {
    let host = generate_keypair().unwrap();
    let impostor = generate_keypair().unwrap();
    let phone = generate_keypair().unwrap();
    let mut client = Client::new(&phone[..32], &host[32..]).unwrap();
    let mut wrong_host = responder(&impostor[..32]).unwrap();
    assert!(read_handshake(&mut wrong_host, &client.start(b"invite").unwrap()).is_err());
    let (mut client, mut server) = connected();
    let mut frame = client.encrypt(b"command").unwrap();
    frame[0] ^= 1;
    assert!(server.decrypt(&frame).is_err());
    assert!(client.encrypt(&vec![0; 61_441]).is_err());
}
