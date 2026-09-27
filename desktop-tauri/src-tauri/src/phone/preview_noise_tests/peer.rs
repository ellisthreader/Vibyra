use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};
use vibyra_host::{EmbeddedHost, PreviewFrame};
use vibyra_transport::{generate_keypair, Client};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub(super) struct Peer {
    socket: Socket,
    client: Client,
    pub(super) id: String,
}

impl Peer {
    pub(super) async fn connect(host: &EmbeddedHost) -> Self {
        let port = host.status()["port"].as_u64().unwrap();
        let url = format!("ws://127.0.0.1:{port}");
        let invitation = host.invite(&url).unwrap();
        let payload: Value = serde_json::from_slice(
            &URL_SAFE_NO_PAD
                .decode(invitation.split("data=").nth(1).unwrap())
                .unwrap(),
        )
        .unwrap();
        let key = generate_keypair().unwrap();
        let id = hex::encode(&key[32..]);
        let mut client = Client::new(&key[..32], &hex::decode(host.id()).unwrap()).unwrap();
        let (mut socket, _) = connect_async(&url).await.unwrap();
        let hello =
            json!({"protocol":1,"deviceName":"Preview test phone","invite":payload["invite"]});
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
        host.answer(&id, true).unwrap();
        let frame = loop {
            let frame = tokio::time::timeout(Duration::from_secs(5), socket.next())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            if frame.is_binary() {
                break frame;
            }
        };
        let reply: Value =
            serde_json::from_slice(&client.finish(&frame.into_data()).unwrap()).unwrap();
        assert_eq!(reply["ok"], true);
        Self { socket, client, id }
    }

    pub(super) async fn send_json(&mut self, value: Value) {
        self.send(&serde_json::to_vec(&value).unwrap()).await;
    }

    pub(super) async fn send_frame(&mut self, frame: PreviewFrame) {
        self.send(&frame.encode().unwrap()).await;
    }

    async fn send(&mut self, plain: &[u8]) {
        self.socket
            .send(Message::Binary(self.client.encrypt(plain).unwrap().into()))
            .await
            .unwrap();
    }

    pub(super) async fn next(&mut self) -> Vec<u8> {
        loop {
            let message = tokio::time::timeout(Duration::from_secs(10), self.socket.next())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            if message.is_binary() {
                return self.client.decrypt(&message.into_data()).unwrap();
            }
        }
    }

    pub(super) async fn reply(&mut self, id: &str) -> Value {
        loop {
            let plain = self.next().await;
            if let Ok(value) = serde_json::from_slice::<Value>(&plain) {
                if value["id"] == id {
                    return value;
                }
            }
        }
    }

    pub(super) async fn next_frame(&mut self) -> PreviewFrame {
        loop {
            let plain = self.next().await;
            if let Ok(frame) = PreviewFrame::decode(&plain) {
                return frame;
            }
        }
    }
}
