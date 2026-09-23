use super::*;
use std::time::Instant;
use vibyra_transport::preview::MAX_CHUNK;

#[tokio::test]
async fn cancel_and_revocation_stop_a_device_preview() {
    let (backend, probe) = TestBackend::new(true);
    let mut connected = connect(backend).await;
    let key = StreamKey::new(11, 20).unwrap();
    send(&mut connected, &Frame::Open { key }.encode().unwrap()).await;
    send(&mut connected, &Frame::Cancel { key }.encode().unwrap()).await;
    send(
        &mut connected,
        &Frame::Data {
            key,
            sequence: 0,
            bytes: vec![1],
        }
        .encode()
        .unwrap(),
    )
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;
    let received = probe.received.lock().unwrap().clone();
    assert!(received.contains(&Frame::Cancel { key }));
    assert!(!received
        .iter()
        .any(|frame| matches!(frame, Frame::Data { .. })));
    connected.shared.revoke(&connected.device).unwrap();
    assert!(tokio::time::timeout(Duration::from_secs(2), connected.task)
        .await
        .unwrap()
        .unwrap()
        .is_err());
    assert!(probe.disconnected.load(Ordering::SeqCst));
}

#[tokio::test]
async fn old_preview_cleanup_cannot_erase_the_new_same_device_session() {
    let (backend, probe) = TestBackend::new(true);
    let (_dir, shared) = state_with_backend(backend);
    let phone = generate_keypair().unwrap();
    let device = hex::encode(&phone[32..]);
    shared.trust(&device, "Trusted phone").unwrap();
    let host = hex::decode(&shared.identity.lock().unwrap().public_key).unwrap();
    let hello = br#"{"protocol":1,"deviceName":"Phone"}"#;

    let mut first = Client::new(&phone[..32], &host).unwrap();
    let (first_input, first_receiver) = async_mpsc::channel(32);
    let (first_sender, mut first_output) = async_mpsc::channel(32);
    let old = tokio::spawn(connection::run(
        shared.clone(),
        first_receiver,
        first_sender,
    ));
    first_input.send(first.start(hello).unwrap()).await.unwrap();
    first.finish(&first_output.recv().await.unwrap()).unwrap();

    let mut second = Client::new(&phone[..32], &host).unwrap();
    let (second_input, second_receiver) = async_mpsc::channel(32);
    let (second_sender, mut second_output) = async_mpsc::channel(32);
    let new = tokio::spawn(connection::run(
        shared.clone(),
        second_receiver,
        second_sender,
    ));
    second_input
        .send(second.start(hello).unwrap())
        .await
        .unwrap();
    second.finish(&second_output.recv().await.unwrap()).unwrap();
    assert!(tokio::time::timeout(Duration::from_secs(2), old)
        .await
        .unwrap()
        .unwrap()
        .is_ok());
    assert!(
        !probe.disconnected.load(Ordering::SeqCst),
        "old session disconnected new Preview"
    );

    second_input
        .send(
            second
                .encrypt(br#"{"id":"live","method":"host.state"}"#)
                .unwrap(),
        )
        .await
        .unwrap();
    let reply: Value = serde_json::from_slice(
        &second
            .decrypt(&second_output.recv().await.unwrap())
            .unwrap(),
    )
    .unwrap();
    assert_eq!(reply["id"], "live");
    drop(second_input);
    assert!(tokio::time::timeout(Duration::from_secs(2), new)
        .await
        .unwrap()
        .unwrap()
        .is_ok());
    assert!(probe.disconnected.load(Ordering::SeqCst));
}

#[tokio::test]
async fn malformed_and_unknown_encrypted_frames_fail_closed() {
    let (backend, probe) = TestBackend::new(true);
    let mut connected = connect(backend).await;
    let key = StreamKey::new(1, 1).unwrap();
    let mut malformed = Frame::Open { key }.encode().unwrap();
    malformed[2] = 99;
    send(&mut connected, &malformed).await;
    assert!(connected.task.await.unwrap().is_err());
    assert!(probe.disconnected.load(Ordering::SeqCst));

    let (backend, _) = TestBackend::new(false);
    let mut connected = connect(backend).await;
    send(&mut connected, b"unknown binary request").await;
    assert!(connected.task.await.unwrap().is_err());
}

#[tokio::test]
async fn ten_megabyte_preview_does_not_hold_a_terminal_reply() {
    let (backend, probe) = TestBackend::new(true);
    let mut connected = connect(backend).await;
    let key = StreamKey::new(12, 30).unwrap();
    let sender = probe.sent.clone();
    let producer = std::thread::spawn(move || {
        sender.send(Frame::Open { key }).unwrap();
        for sequence in 0..640 {
            sender
                .send(Frame::Data {
                    key,
                    sequence,
                    bytes: vec![sequence as u8; MAX_CHUNK],
                })
                .unwrap();
        }
    });
    assert_eq!(
        Frame::decode(&next(&mut connected).await).unwrap(),
        Frame::Open { key }
    );
    let started = Instant::now();
    send(
        &mut connected,
        br#"{"id":"terminal","method":"session.input"}"#,
    )
    .await;
    let mut data_bytes = 0;
    loop {
        let plain = next(&mut connected).await;
        if let Ok(reply) = serde_json::from_slice::<Value>(&plain) {
            assert_eq!(reply["id"], "terminal");
            break;
        }
        if let Frame::Data { bytes, .. } = Frame::decode(&plain).unwrap() {
            data_bytes += bytes.len();
        }
    }
    assert!(
        started.elapsed() < Duration::from_secs(1),
        "terminal waited behind Preview bulk"
    );
    while data_bytes < 10 * 1024 * 1024 {
        if let Frame::Data { bytes, .. } = Frame::decode(&next(&mut connected).await).unwrap() {
            data_bytes += bytes.len();
        }
    }
    producer.join().unwrap();
    assert_eq!(data_bytes, 10 * 1024 * 1024);
    connected.task.abort();
}
