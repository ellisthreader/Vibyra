mod support;
use self::support::{backend, send_envelope};
use crate::relay_test_support::{next_frame, unb64};
use crate::{EmbeddedHost, PreviewFrame as Frame, RelayCredentials, StreamKey, MAX_CHUNK};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use vibyra_transport::{generate_keypair, Client};

#[tokio::test]
async fn cloud_leg_forwards_full_preview_chunk_and_terminal_rpc_on_one_noise_session() {
    let dir = tempfile::tempdir().unwrap();
    let host = EmbeddedHost::start(
        dir.path().to_owned(),
        "127.0.0.1:0".parse().unwrap(),
        backend(),
        "Relay Preview Mac",
    )
    .unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    let leg = host.relay(Arc::new(move || {
        let url = url.clone();
        Box::pin(async move {
            Ok(RelayCredentials {
                url,
                token: "test-token".into(),
                name: "Mac".into(),
            })
        })
    }));
    let (stream, _) = tokio::time::timeout(Duration::from_secs(5), listener.accept())
        .await
        .unwrap()
        .unwrap();
    let mut relay = accept_async(stream).await.unwrap();
    let register: Value = match relay.next().await.unwrap().unwrap() {
        Message::Text(text) => serde_json::from_str(&text).unwrap(),
        other => panic!("unexpected {other:?}"),
    };
    let host_key = register["hostId"].as_str().unwrap();
    relay
        .send(Message::Text(
            json!({"type":"host.ready"}).to_string().into(),
        ))
        .await
        .unwrap();
    relay
        .send(Message::Text(
            json!({"type":"client.open","clientId":"phone-1"})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    let phone = generate_keypair().unwrap();
    let device = hex::encode(&phone[32..]);
    let mut client = Client::new(&phone[..32], &hex::decode(host_key).unwrap()).unwrap();
    let hello = client
        .start(br#"{"protocol":1,"deviceName":"Relay phone"}"#)
        .unwrap();
    send_envelope(&mut relay, &hello).await;
    for _ in 0..100 {
        if !host.status()["pending"].as_array().unwrap().is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    host.answer(&device, true).unwrap();
    let handshake = unb64(&next_frame(&mut relay).await);
    let accepted: Value = serde_json::from_slice(&client.finish(&handshake).unwrap()).unwrap();
    assert_eq!(accepted["ok"], true);

    let key = StreamKey::new(37, 53).unwrap();
    send_envelope(
        &mut relay,
        &client
            .encrypt(&Frame::Open { key }.encode().unwrap())
            .unwrap(),
    )
    .await;
    let credit = client
        .decrypt(&unb64(&next_frame(&mut relay).await))
        .unwrap();
    assert_eq!(
        Frame::decode(&credit).unwrap(),
        Frame::Credit { key, total: 65536 }
    );
    let payload = (0..MAX_CHUNK)
        .map(|index| (index % 251) as u8)
        .collect::<Vec<_>>();
    let chunk = Frame::Data {
        key,
        sequence: 0,
        bytes: payload.clone(),
    }
    .encode()
    .unwrap();
    send_envelope(&mut relay, &client.encrypt(&chunk).unwrap()).await;
    send_envelope(
        &mut relay,
        &client
            .encrypt(br#"{"id":"terminal","method":"host.state"}"#)
            .unwrap(),
    )
    .await;
    let mut terminal = false;
    let mut echoed = false;
    let mut opened = false;
    for _ in 0..8 {
        let ciphertext = unb64(&next_frame(&mut relay).await);
        let plain = client.decrypt(&ciphertext).unwrap();
        if let Ok(reply) = serde_json::from_slice::<Value>(&plain) {
            assert_eq!(reply["id"], "terminal");
            assert_eq!(reply["result"]["method"], "host.state");
            terminal = true;
        } else {
            match Frame::decode(&plain).unwrap() {
                Frame::Open { key: response } if response == key => opened = true,
                Frame::Data {
                    key: response,
                    sequence: 0,
                    bytes,
                } if response == key => {
                    assert!(opened);
                    assert_eq!(bytes, payload);
                    echoed = true;
                }
                other => panic!("unexpected relay Preview frame: {other:?}"),
            }
        }
        if terminal && echoed {
            break;
        }
    }
    assert!(
        terminal && echoed,
        "terminal and full Preview chunk must both arrive"
    );
    drop(leg);
}
