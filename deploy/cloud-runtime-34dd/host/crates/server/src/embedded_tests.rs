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
pub(super) struct ViewBackend(Mutex<Vec<mpsc::Sender<Value>>>);
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
    verify_socket("127.0.0.1:0").await;
}

#[tokio::test]
async fn ipv6_socket_pairing_reconnect_revocation_and_shutdown() {
    verify_socket("[::1]:0").await;
}

async fn verify_socket(bind: &str) {
    let dir = tempfile::tempdir().unwrap();
    let host = EmbeddedHost::start(
        dir.path().to_owned(),
        bind.parse().unwrap(),
        Arc::new(ViewBackend::default()),
        "Vibyra Desktop",
    )
    .unwrap();
    let ip = bind.parse::<std::net::SocketAddr>().unwrap().ip();
    let url = format!(
        "ws://{}",
        std::net::SocketAddr::new(ip, host.status()["port"].as_u64().unwrap() as u16)
    );
    let invitation = host.invite(&url).unwrap();
    let payload: Value = serde_json::from_slice(
        &URL_SAFE_NO_PAD
            .decode(invitation.split("data=").nth(1).unwrap())
            .unwrap(),
    )
    .unwrap();
    if ip.is_ipv6() {
        assert_eq!(payload["network"], "lan");
    }
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
        for _ in 0..100 {
            if !host.status()["pending"].as_array().unwrap().is_empty() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert_eq!(host.lan_approval_mode(), "ask");
        assert_eq!(host.status()["devices"].as_array().unwrap().len(), round);
        host.answer(&id, true).unwrap();
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
        bind.parse().unwrap(),
        Arc::new(ViewBackend::default()),
        "Vibyra Desktop",
    )
    .unwrap();
    assert!(restarted.status()["devices"].as_array().unwrap().is_empty());
}

/// A phone on this very machine — an iOS Simulator — reaches the desktop as
/// 127.0.0.1, so a listener pinned to one LAN address must also answer there.
#[test]
fn a_pinned_listener_also_answers_on_loopback() {
    use super::embedded::companion_loopback;
    let lan: std::net::SocketAddr = "192.168.1.118:4319".parse().unwrap();
    assert_eq!(
        companion_loopback(lan),
        Some("127.0.0.1:4319".parse().unwrap()),
        "an address on the network gains a same-machine companion"
    );
    let six: std::net::SocketAddr = "[2a00:23c7:9a90:fc01::10]:4319".parse().unwrap();
    assert_eq!(companion_loopback(six), Some("[::1]:4319".parse().unwrap()));
    // Loopback needs no companion, and an unbound port has none to share.
    assert_eq!(companion_loopback("127.0.0.1:4319".parse().unwrap()), None);
    assert_eq!(companion_loopback("[::1]:4319".parse().unwrap()), None);
    assert_eq!(companion_loopback("192.168.1.118:0".parse().unwrap()), None);
}

/// The whole point of the companion listener, proven against a real socket: a
/// desktop pinned to its network address still answers a phone that reaches it
/// on this machine, which is how an iOS Simulator arrives. Skipped where the
/// machine has no network address to pin to.
#[tokio::test]
async fn a_desktop_pinned_to_its_network_address_answers_on_loopback_too() {
    let Some(lan) = this_machine_address() else {
        eprintln!("skipped: no supported non-loopback LAN address on this machine");
        return;
    };
    let dir = tempfile::tempdir().unwrap();
    // A fixed port, because the companion has to share it.
    let port = free_port();
    let _host = EmbeddedHost::start(
        dir.path().to_owned(),
        std::net::SocketAddr::new(lan, port),
        Arc::new(ViewBackend::default()),
        "Pinned Desktop",
    )
    .unwrap();
    let loopback = super::embedded::companion_loopback(std::net::SocketAddr::new(lan, port))
        .unwrap()
        .ip();
    for reach in [lan, loopback] {
        let served = ask_identity(std::net::SocketAddr::new(reach, port)).await;
        assert!(
            served.contains("\"version\":1"),
            "no presence served at {reach}: {served}"
        );
    }
}

fn this_machine_address() -> Option<std::net::IpAddr> {
    // Like Desktop, reject an IPv4 CLAT shim and try a native IPv6 route.
    // UDP connect chooses a source address without sending any data.
    for (bind, target) in [("0.0.0.0:0", "192.0.2.1:9"), ("[::]:0", "[2001:db8::1]:9")] {
        let selected = std::net::UdpSocket::bind(bind).and_then(|socket| {
            socket.connect(target)?;
            socket.local_addr()
        });
        if let Ok(address) = selected {
            if !address.ip().is_loopback() && super::peer_policy::allowed(address, address) {
                return Some(address.ip());
            }
        }
    }
    None
}

fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

async fn ask_identity(address: std::net::SocketAddr) -> String {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let Ok(Ok(mut stream)) = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        tokio::net::TcpStream::connect(address),
    )
    .await
    else {
        return format!("could not connect to {address}");
    };
    let _ = stream
        .write_all(b"GET /identity HTTP/1.1\r\nHost: x\r\n\r\n")
        .await;
    let mut reply = String::new();
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        stream.read_to_string(&mut reply),
    )
    .await;
    reply
}
