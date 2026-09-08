use crate::{
    connection,
    test_support::{approve_when_pending, state, token},
};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use vibyra_transport::{generate_keypair, Client};

#[tokio::test]
async fn encrypted_pairing_state_and_revocation_roundtrip() {
    let (_dir, shared) = state();
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    let host = hex::decode(&shared.identity.lock().unwrap().public_key).unwrap();
    let invite = token(&shared.invite(None).unwrap());
    let mut client = Client::new(&key[..32], &host).unwrap();
    let (input, receiver) = mpsc::channel(32);
    let (sender, mut output) = mpsc::channel(32);
    let task = tokio::spawn(connection::run(shared.clone(), receiver, sender));
    input
        .send(
            client
                .start(
                    json!({"protocol":1,"deviceName":"Test iPhone","invite":invite})
                        .to_string()
                        .as_bytes(),
                )
                .unwrap(),
        )
        .await
        .unwrap();
    approve_when_pending(shared.clone(), device.clone()).await;
    let hello: Value =
        serde_json::from_slice(&client.finish(&output.recv().await.unwrap()).unwrap()).unwrap();
    assert_eq!(hello["ok"], true);
    let request = json!({"id":"state-1","method":"host.state","params":{}});
    input
        .send(client.encrypt(request.to_string().as_bytes()).unwrap())
        .await
        .unwrap();
    let reply: Value =
        serde_json::from_slice(&client.decrypt(&output.recv().await.unwrap()).unwrap()).unwrap();
    assert_eq!(reply["id"], "state-1");
    assert_eq!(reply["result"]["host"]["name"], "Test computer");
    assert_eq!(reply["result"]["devices"][0]["id"], device);
    shared.revoke(&device).unwrap();
    let done = tokio::time::timeout(std::time::Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap();
    assert!(done.is_err());
    assert!(!shared.active.lock().unwrap().contains(&device));
}

#[tokio::test]
async fn replayed_transport_frame_closes_connection_without_second_dispatch() {
    let (_dir, shared) = state();
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    shared.trust(&device, "Trusted test phone").unwrap();
    let host = hex::decode(&shared.identity.lock().unwrap().public_key).unwrap();
    let mut client = Client::new(&key[..32], &host).unwrap();
    let (input, receiver) = mpsc::channel(32);
    let (sender, mut output) = mpsc::channel(32);
    let task = tokio::spawn(connection::run(shared, receiver, sender));
    input
        .send(
            client
                .start(br#"{"protocol":1,"deviceName":"Phone"}"#)
                .unwrap(),
        )
        .await
        .unwrap();
    client.finish(&output.recv().await.unwrap()).unwrap();
    let request = client
        .encrypt(br#"{"id":"one","method":"host.state","params":{}}"#)
        .unwrap();
    input.send(request.clone()).await.unwrap();
    assert!(output.recv().await.is_some());
    input.send(request).await.unwrap();
    assert!(task.await.unwrap().is_err());
}
