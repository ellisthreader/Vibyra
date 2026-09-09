use crate::{Backend, EmbeddedHost};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use vibyra_transport::{generate_keypair, Client};

#[derive(Default)]
struct ViewBackend(Mutex<Vec<mpsc::Sender<Value>>>);
impl Backend for ViewBackend {
    fn handle(&self, _: &str, method: &str, _: Value) -> Result<Value, String> {
        if method == "host.state" {
            Ok(json!({"protocol":1,"sessions":[],"projects":[]}))
        } else {
            Err("View only".into())
        }
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        let (send, receive) = mpsc::channel();
        self.0.lock().unwrap().push(send);
        receive
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "View only"
    }
}

#[tokio::test]
async fn actual_socket_pairing_reconnect_revocation_and_shutdown() {
    let dir = tempfile::tempdir().unwrap();
    let host = EmbeddedHost::start(
        dir.path().to_owned(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(ViewBackend::default()),
    )
    .unwrap();
    let url = format!("ws://127.0.0.1:{}", host.status()["port"]);
    let invitation = host.invite(&url).unwrap();
    let payload: Value = serde_json::from_slice(
        &URL_SAFE_NO_PAD
            .decode(invitation.split("data=").nth(1).unwrap())
            .unwrap(),
    )
    .unwrap();
    let key = generate_keypair().unwrap();
    let id = hex::encode(&key[32..]);
    for round in 0..2 {
        let (mut socket, _) = connect_async(&url).await.unwrap();
        let mut client = Client::new(
            &key[..32],
            &hex::decode(payload["publicKey"].as_str().unwrap()).unwrap(),
        )
        .unwrap();
        let hello = json!({"protocol":1,"deviceName":"Test iPhone","invite":if round == 0 {payload["invite"].clone()} else {Value::Null}});
        socket
            .send(Message::Binary(
                client.start(hello.to_string().as_bytes()).unwrap().into(),
            ))
            .await
            .unwrap();
        if round == 0 {
            for _ in 0..100 {
                if !host.status()["pending"].as_array().unwrap().is_empty() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            assert!(host.status()["devices"].as_array().unwrap().is_empty());
            host.answer(&id, true).unwrap();
        }
        let reply = loop {
            let frame = tokio::time::timeout(Duration::from_secs(3), socket.next())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            if frame.is_binary() {
                break frame;
            }
        };
        let hello: Value =
            serde_json::from_slice(&client.finish(&reply.into_data()).unwrap()).unwrap();
        assert_eq!(hello["ok"], true);
        socket
            .send(Message::Binary(
                client
                    .encrypt(br#"{"id":"state","method":"host.state","params":{}}"#)
                    .unwrap()
                    .into(),
            ))
            .await
            .unwrap();
        let mut success = false;
        for _ in 0..5 {
            let reply = socket.next().await.unwrap().unwrap();
            if !reply.is_binary() {
                continue;
            }
            let value: Value =
                serde_json::from_slice(&client.decrypt(&reply.into_data()).unwrap()).unwrap();
            assert_eq!(value["result"]["host"]["name"], "Vibyra Desktop");
            success = true;
            break;
        }
        assert!(success);
        if round == 1 {
            host.revoke(&id).unwrap();
            let closed = tokio::time::timeout(Duration::from_secs(3), socket.next())
                .await
                .unwrap();
            assert!(closed.is_none() || closed.unwrap().map_or(true, |m| m.is_close()));
        } else {
            socket.close(None).await.unwrap();
        }
        for _ in 0..100 {
            if host.status()["active"].as_array().unwrap().is_empty() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }
    drop(host);
    assert!(connect_async(&url).await.is_err());
    let restarted = EmbeddedHost::start(
        dir.path().to_owned(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(ViewBackend::default()),
    )
    .unwrap();
    assert!(restarted.status()["devices"].as_array().unwrap().is_empty());
}
