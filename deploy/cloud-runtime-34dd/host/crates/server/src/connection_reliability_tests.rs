//! A relay leg survives one phone's bad envelope.
use crate::relay_test_support::{b64, next_frame, unb64, ViewBackend};
use crate::{EmbeddedHost, RelayCredentials};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use vibyra_transport::{generate_keypair, Client};

/// A lease renewal for a phone that already left used to end the whole relay
/// leg, and with it every other phone on the computer.
#[tokio::test]
async fn one_phones_bad_envelope_closes_only_that_phone() {
    let dir = tempfile::tempdir().unwrap();
    let host = EmbeddedHost::start(
        dir.path().to_owned(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(ViewBackend::default()),
        "Vibyra Desktop",
    )
    .unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    let leg = host.relay(Arc::new(move || {
        let url = url.clone();
        Box::pin(async move {
            Ok(RelayCredentials {
                authorization_key: None,
                allow_unsigned_loopback: true,
                authorization_context: None,
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
    let host_key = register["hostId"].as_str().unwrap().to_string();
    let text = |value: Value| Message::Text(value.to_string().into());
    relay
        .send(text(json!({"type":"host.ready"})))
        .await
        .unwrap();
    relay
        .send(text(json!({"type":"client.open","clientId":"phone-1"})))
        .await
        .unwrap();
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    let mut client = Client::new(&key[..32], &hex::decode(&host_key).unwrap()).unwrap();
    let hello = client
        .start(br#"{"protocol":1,"deviceName":"Phone"}"#)
        .unwrap();
    relay
        .send(text(
            json!({"type":"frame","clientId":"phone-1","data":b64(&hello)}),
        ))
        .await
        .unwrap();
    for _ in 0..100 {
        if !host.status()["pending"].as_array().unwrap().is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    host.answer(&device, true).unwrap();
    let reply: Value = serde_json::from_slice(
        &client
            .finish(&unb64(&next_frame(&mut relay).await))
            .unwrap(),
    )
    .unwrap();
    assert_eq!(reply["ok"], true, "{reply}");
    let confirm = client
        .encrypt(br#"{"id":"c","method":"host.state","params":{}}"#)
        .unwrap();
    relay
        .send(text(
            json!({"type":"frame","clientId":"phone-1","data":b64(&confirm)}),
        ))
        .await
        .unwrap();
    // Read in order: Noise counts every message.
    client
        .decrypt(&unb64(&next_frame(&mut relay).await))
        .unwrap();

    // A renewal for a phone this computer no longer has.
    relay
        .send(text(
            json!({"type":"client.authorize","clientId":"gone","authorization":"x"}),
        ))
        .await
        .unwrap();
    let close: Value = loop {
        match tokio::time::timeout(Duration::from_secs(3), relay.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap()
        {
            Message::Text(text) => {
                let value: Value = serde_json::from_str(&text).unwrap();
                if value["type"] == "client.close" {
                    break value;
                }
            }
            Message::Ping(_) | Message::Pong(_) => {}
            other => panic!("leg ended: {other:?}"),
        }
    };
    assert_eq!(close["clientId"], "gone");

    // The other phone is still served on the same leg.
    let request = client
        .encrypt(br#"{"id":"s","method":"host.state","params":{}}"#)
        .unwrap();
    relay
        .send(text(
            json!({"type":"frame","clientId":"phone-1","data":b64(&request)}),
        ))
        .await
        .unwrap();
    let state: Value = serde_json::from_slice(
        &client
            .decrypt(&unb64(&next_frame(&mut relay).await))
            .unwrap(),
    )
    .unwrap();
    assert_eq!(state["id"], "s");
    assert_eq!(leg.status().state, "online");
}
