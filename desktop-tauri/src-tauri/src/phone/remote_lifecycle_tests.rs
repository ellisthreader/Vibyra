//! Real outbound relay sockets must end at account boundaries while the
//! separately approved nearby connection remains available.
use super::PhoneConnection;
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use tokio::{
    net::{TcpListener, TcpStream},
    time::{sleep, timeout},
};
use tokio_tungstenite::{accept_async, connect_async, tungstenite::Message, WebSocketStream};
use vibyra_core::pty::{FlushConfig, OutputSink, PtyManager};
use vibyra_host::{Backend, EmbeddedHost, RelayCredentials};
use vibyra_transport::{generate_keypair, Client};

#[path = "remote_lifecycle_fixture.rs"]
mod fixture;
use fixture::{frame, next, send, Sink, View};
async fn check_boundary(change: fn(&mut PhoneConnection)) {
    let dir = tempfile::tempdir().unwrap();
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let mut phone = PhoneConnection::new(dir.path().join("settings"), manager.clone()).into_inner();
    let host = EmbeddedHost::start(
        dir.path().join("host"),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(View::default()),
        "Test",
    )
    .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    phone.remote_enabled = true;
    phone.remote = Some(host.relay(Arc::new(move || {
        let url = url.clone();
        Box::pin(async move {
            Ok(RelayCredentials {
                authorization_key: None,
                allow_unsigned_loopback: true,
                authorization_context: None,
                url,
                token: "synthetic-account-a".into(),
                name: "Test".into(),
            })
        })
    })));
    phone.host = Some(host);
    let (socket, _) = timeout(Duration::from_secs(3), listener.accept())
        .await
        .unwrap()
        .unwrap();
    let mut relay = accept_async(socket).await.unwrap();
    let registration = next(&mut relay).await;
    assert_eq!(registration["token"], "synthetic-account-a");
    send(&mut relay, json!({"type":"host.ready"})).await;
    send(&mut relay, json!({"type":"client.open","clientId":"phone"})).await;
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    let mut client = Client::new(
        &key[..32],
        &hex::decode(phone.host().unwrap().id()).unwrap(),
    )
    .unwrap();
    frame(
        &mut relay,
        client
            .start(br#"{"protocol":1,"deviceName":"Test phone"}"#)
            .unwrap(),
    )
    .await;
    timeout(Duration::from_secs(3), async {
        while phone.status()["pending"].as_array().unwrap().is_empty() {
            sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    phone.host().unwrap().answer(&device, true).unwrap();
    let reply = next(&mut relay).await;
    client
        .finish(&STANDARD.decode(reply["data"].as_str().unwrap()).unwrap())
        .unwrap();
    frame(
        &mut relay,
        client
            .encrypt(br#"{"id":"state","method":"host.state"}"#)
            .unwrap(),
    )
    .await;
    let reply = next(&mut relay).await;
    let result: Value = serde_json::from_slice(
        &client
            .decrypt(&STANDARD.decode(reply["data"].as_str().unwrap()).unwrap())
            .unwrap(),
    )
    .unwrap();
    assert_eq!(result["id"], "state");
    assert_eq!(phone.status()["active"], json!([device]));
    phone
        .host()
        .unwrap()
        .set_lan_approval_mode("trusted")
        .unwrap();
    change(&mut phone);
    assert_eq!(
        phone.host().unwrap().lan_approval_mode(),
        "ask",
        "an account boundary cannot retain unattended nearby control"
    );
    assert!(phone.remote.is_none());
    assert!(
        phone.remote_enabled,
        "account change must preserve the local preference"
    );
    timeout(Duration::from_secs(3), async {
        loop {
            match relay.next().await {
                None | Some(Err(_)) | Some(Ok(Message::Close(_))) => break,
                Some(Ok(Message::Ping(data))) => {
                    let _ = relay.send(Message::Pong(data)).await;
                }
                _ => {}
            }
        }
    })
    .await
    .unwrap();
    timeout(Duration::from_secs(3), async {
        while !phone.status()["active"].as_array().unwrap().is_empty() {
            sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(phone.status()["devices"][0]["id"], device);
    let url = format!("ws://127.0.0.1:{}", phone.status()["port"]);
    let (mut nearby, _) = connect_async(url).await.unwrap();
    nearby.close(None).await.unwrap();
    assert!(
        timeout(Duration::from_millis(100), listener.accept())
            .await
            .is_err(),
        "old account leg restarted"
    );
    drop(phone);
    manager.shutdown();
}

#[tokio::test]
async fn account_signout_closes_live_cloud_sockets() {
    check_boundary(PhoneConnection::account_signed_out).await;
}
#[tokio::test]
async fn account_replacement_drops_the_previous_cloud_leg_before_registration() {
    check_boundary(PhoneConnection::account_signed_in).await;
}

#[test]
fn disabling_cloud_stays_off_when_local_preferences_cannot_be_saved() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("not-a-directory");
    std::fs::write(&path, "block persistence").unwrap();
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let mut phone = PhoneConnection::new(path, manager.clone()).into_inner();
    phone.remote_enabled = true;
    assert!(phone.set_remote(false).is_err());
    assert!(!phone.remote_enabled);
    phone.account_signed_in();
    assert!(phone.remote.is_none());
    manager.shutdown();
}

#[test]
fn revoke_all_clears_local_trust_even_when_sharing_is_stopped() {
    let dir = tempfile::tempdir().unwrap();
    let host = EmbeddedHost::start(
        dir.path().to_owned(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(View::default()),
        "Test",
    )
    .unwrap();
    let host_id = host.id();
    let key = "a".repeat(64);
    host.approve_remote_device(&key, "Saved phone").unwrap();
    drop(host);
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let phone = PhoneConnection::new(dir.path().to_owned(), manager.clone()).into_inner();
    assert!(phone.owns_remote_host(&host_id).unwrap());
    assert!(!phone.owns_remote_host(&"b".repeat(64)).unwrap());
    phone.revoke_remote_devices(None).unwrap();
    let saved: Value =
        serde_json::from_slice(&std::fs::read(dir.path().join("identity.json")).unwrap()).unwrap();
    assert!(saved["devices"].as_object().unwrap().is_empty());
    manager.shutdown();
}
