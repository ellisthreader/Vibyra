use crate::{embedded_tests::ViewBackend, EmbeddedHost};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use vibyra_transport::{generate_keypair, Client};

#[tokio::test]
async fn changing_listener_keeps_an_authenticated_phone_connected_and_trusted() {
    let dir = tempfile::tempdir().unwrap();
    let mut host = EmbeddedHost::start(
        dir.path().to_owned(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(ViewBackend::default()),
        "My computer",
    )
    .unwrap();
    host.set_lan_approval_mode("trusted").unwrap();
    let old_url = format!("ws://127.0.0.1:{}", host.status()["port"]);
    let invitation = host.invite(&old_url).unwrap();
    let payload: Value = serde_json::from_slice(
        &URL_SAFE_NO_PAD
            .decode(invitation.split("data=").nth(1).unwrap())
            .unwrap(),
    )
    .unwrap();
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    let host_key = hex::decode(host.id()).unwrap();
    let (mut socket, _) = connect_async(&old_url).await.unwrap();
    let mut client = Client::new(&key[..32], &host_key).unwrap();
    let hello = json!({"protocol":1,"deviceName":"Phone","invite":payload["invite"]});
    socket
        .send(Message::Binary(
            client.start(hello.to_string().as_bytes()).unwrap().into(),
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
    let reply = binary_reply(&mut socket).await;
    assert_eq!(
        serde_json::from_slice::<Value>(&client.finish(&reply).unwrap()).unwrap()["ok"],
        true
    );
    assert_eq!(
        read_state(&mut socket, &mut client).await["result"]["host"]["name"],
        "My computer"
    );

    let occupied = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    assert!(host.rebind(occupied.local_addr().unwrap()).is_err());
    assert_eq!(
        read_state(&mut socket, &mut client).await["result"]["host"]["name"],
        "My computer",
        "a failed replacement bind must leave the current phone connected"
    );
    drop(occupied);

    host.rebind("127.0.0.1:0".parse().unwrap()).unwrap();
    let new_url = format!("ws://127.0.0.1:{}", host.status()["port"]);
    wait_for_new_listener(host.status()["port"].as_u64().unwrap() as u16).await;
    assert_eq!(
        read_state(&mut socket, &mut client).await["result"]["host"]["name"],
        "My computer",
        "the existing encrypted socket must survive the listener swap"
    );
    assert_ne!(old_url, new_url);
    let (mut returning, _) = connect_async(&new_url).await.unwrap();
    let mut resumed = Client::new(&key[..32], &host_key).unwrap();
    returning
        .send(Message::Binary(
            resumed
                .start(
                    json!({"protocol":1,"deviceName":"Phone"})
                        .to_string()
                        .as_bytes(),
                )
                .unwrap()
                .into(),
        ))
        .await
        .unwrap();
    let reply = binary_reply(&mut returning).await;
    assert_eq!(
        serde_json::from_slice::<Value>(&resumed.finish(&reply).unwrap()).unwrap()["ok"],
        true,
        "trusted phone reconnects without another approval"
    );
    assert_eq!(
        read_state(&mut returning, &mut resumed).await["result"]["host"]["name"],
        "My computer"
    );
    assert_eq!(host.status()["devices"].as_array().unwrap().len(), 1);
}

async fn read_state(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    client: &mut Client,
) -> Value {
    socket
        .send(Message::Binary(
            client
                .encrypt(br#"{"id":"state","method":"host.state","params":{}}"#)
                .unwrap()
                .into(),
        ))
        .await
        .unwrap();
    loop {
        let frame = tokio::time::timeout(Duration::from_secs(3), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        if frame.is_binary() {
            let value: Value =
                serde_json::from_slice(&client.decrypt(&frame.into_data()).unwrap()).unwrap();
            if value["id"] == "state" {
                return value;
            }
        }
    }
}

async fn binary_reply(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) -> Vec<u8> {
    loop {
        let frame = tokio::time::timeout(Duration::from_secs(3), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        if frame.is_binary() {
            return frame.into_data().to_vec();
        }
    }
}

async fn wait_for_new_listener(port: u16) {
    let address = format!("127.0.0.1:{port}");
    let reply = tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if let Ok(mut socket) = tokio::net::TcpStream::connect(&address).await {
                let _ = socket
                    .write_all(b"GET /identity HTTP/1.1\r\nHost: localhost\r\n\r\n")
                    .await;
                let mut bytes = [0u8; 512];
                if let Ok(Ok(count)) =
                    tokio::time::timeout(Duration::from_millis(200), socket.read(&mut bytes)).await
                {
                    if count > 0 && String::from_utf8_lossy(&bytes[..count]).contains("200 OK") {
                        return;
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await;
    assert!(reply.is_ok(), "new listener did not start serving presence");
}
