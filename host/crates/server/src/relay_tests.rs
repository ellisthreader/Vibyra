use crate::relay_test_support::{b64, next_frame, unb64, ViewBackend};
use crate::{EmbeddedHost, RelayCredentials};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use vibyra_transport::{generate_keypair, Client};

/// A stand-in for Vibyra Cloud: one relay socket, then one phone through it.
/// The embedded host connects out to it exactly as it would to the real relay,
/// and the phone side speaks the same Noise handshake it does on the LAN.
#[tokio::test]
async fn the_embedded_host_registers_with_the_relay_and_serves_a_phone_through_it() {
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
    let calls = Arc::new(Mutex::new(0));
    let counted = calls.clone();
    let leg = host.relay(Arc::new(move || {
        let url = url.clone();
        let counted = counted.clone();
        Box::pin(async move {
            *counted.lock().unwrap() += 1;
            Ok(RelayCredentials {
                url,
                token: "test-token".into(),
                name: "Ellis MacBook".into(),
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
    let host_id = host.status()["devices"].clone();
    assert_eq!(host_id, json!([]));
    assert_eq!(register["type"], "host.register");
    assert_eq!(register["token"], "test-token");
    assert_eq!(register["name"], "Ellis MacBook");
    let host_key = register["hostId"].as_str().unwrap().to_string();
    assert_eq!(host_key.len(), 64);
    relay
        .send(Message::Text(
            json!({"type":"host.ready"}).to_string().into(),
        ))
        .await
        .unwrap();
    for _ in 0..50 {
        if leg.status().state == "online" {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(leg.status().state, "online");
    assert_eq!(*calls.lock().unwrap(), 1);

    // A phone arrives through the relay, with no invitation: like a nearby
    // phone, it waits in the approval queue until this computer allows it.
    relay
        .send(Message::Text(
            json!({"type":"client.open","clientId":"phone-1","name":"Ellis iPhone"})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    let mut client = Client::new(&key[..32], &hex::decode(&host_key).unwrap()).unwrap();
    let hello = client
        .start(br#"{"protocol":1,"deviceName":"Ellis iPhone"}"#)
        .unwrap();
    relay
        .send(Message::Text(
            json!({"type":"frame","clientId":"phone-1","data":b64(&hello)})
                .to_string()
                .into(),
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
    let frame = next_frame(&mut relay).await;
    let reply: Value = serde_json::from_slice(&client.finish(&unb64(&frame)).unwrap()).unwrap();
    assert_eq!(reply["ok"], true, "{reply}");
    assert_eq!(reply["deviceId"], device);
    let request = client
        .encrypt(br#"{"id":"s","method":"host.state","params":{}}"#)
        .unwrap();
    relay
        .send(Message::Text(
            json!({"type":"frame","clientId":"phone-1","data":b64(&request)})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    let frame = next_frame(&mut relay).await;
    let state: Value = serde_json::from_slice(&client.decrypt(&unb64(&frame)).unwrap()).unwrap();
    assert_eq!(state["result"]["protocol"], 1);
    assert_eq!(state["result"]["host"]["name"], "Vibyra Desktop");
    assert_eq!(leg.status().clients, 1);

    // Disconnect all remote sessions: the phone is told to go, the relay
    // registration stays.
    leg.disconnect_all();
    let close: Value = match tokio::time::timeout(Duration::from_secs(3), relay.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
    {
        Message::Text(text) => serde_json::from_str(&text).unwrap(),
        other => panic!("unexpected {other:?}"),
    };
    assert_eq!(close["type"], "client.close");
    assert_eq!(close["clientId"], "phone-1");
    for _ in 0..50 {
        if leg.status().clients == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(
        (leg.status().state.as_str(), leg.status().clients),
        ("online", 0)
    );
    drop(leg);
    assert!(relay
        .next()
        .await
        .is_none_or(|m| m.is_err() || m.unwrap().is_close()));
}
