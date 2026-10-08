use crate::{embedded_tests::ViewBackend, *};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::sync::Arc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
#[tokio::test]
async fn a_remote_reset_ends_an_actual_remembered_lan_connection() {
    let dir = tempfile::tempdir().unwrap();
    let host = EmbeddedHost::start(
        dir.path().into(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(ViewBackend::default()),
        "Test",
    )
    .unwrap();
    let key = vibyra_transport::generate_keypair().unwrap();
    let id = hex::encode(&key[32..]);
    host.approve_remote_device(&id, "Phone").unwrap();
    host.set_lan_approval_mode("trusted").unwrap();
    let url = format!("ws://127.0.0.1:{}", host.status()["port"].as_u64().unwrap());
    let (mut socket, _) = connect_async(url).await.unwrap();
    let mut client =
        vibyra_transport::Client::new(&key[..32], &hex::decode(host.id()).unwrap()).unwrap();
    socket
        .send(Message::Binary(
            client
                .start(br#"{"protocol":1,"deviceName":"Phone"}"#)
                .unwrap()
                .into(),
        ))
        .await
        .unwrap();
    loop {
        let response = socket.next().await.unwrap().unwrap();
        if response.is_binary() {
            client.finish(&response.into_data()).unwrap();
            break;
        }
    }
    socket
        .send(Message::Binary(
            client
                .encrypt(br#"{"id":"state","method":"host.state","params":{}}"#)
                .unwrap()
                .into(),
        ))
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(3), socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    host.registration_proof()
        .bind_restriction_context(
            "account",
            &AuthorizationContext {
                user_id: "1".into(),
                generation: 7,
            },
        )
        .unwrap();
    let checkpoint = host.restriction_checkpoint("account").unwrap().unwrap();
    let mut batch = RestrictionBatch::new(checkpoint.receipt.clone());
    batch
        .accept(
            &host.id(),
            serde_json::from_value(json!({"hostId":host.id(),"userId":"1","generation":7,
        "revision":1,"disableRevision":0,"resetRevision":1,"revokedDevices":[],"approvedDevices":[],
        "nextRevision":1,"hasMore":false}))
            .unwrap(),
        )
        .unwrap();
    checkpoint.finish(batch).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        while let Some(Ok(message)) = socket.next().await {
            if message.is_close() {
                break;
            }
        }
    })
    .await
    .expect("revoked LAN connection must close");
    assert!(host.status()["devices"].as_array().unwrap().is_empty());
}
#[test]
fn first_managed_migration_cannot_start_with_unchecked_unattended_consent() {
    let dir = tempfile::tempdir().unwrap();
    let backend = Arc::new(ViewBackend::default());
    let host = EmbeddedHost::start(
        dir.path().into(),
        "127.0.0.1:0".parse().unwrap(),
        backend.clone(),
        "Test",
    )
    .unwrap();
    host.set_lan_approval_mode("trusted").unwrap();
    drop(host);
    let host = EmbeddedHost::start_managed_with_key_store(
        dir.path().into(),
        "127.0.0.1:0".parse().unwrap(),
        backend,
        "Test",
        None,
        true,
    )
    .unwrap();
    assert_eq!(host.lan_approval_mode(), "ask");
    assert_eq!(host.status()["securitySyncPending"], true);
}
