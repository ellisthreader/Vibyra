use crate::{
    connection,
    lan_authorization::LanMode,
    state::{Origin, Shared},
    test_support::nearby_state,
};
use serde_json::Value;
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;
use vibyra_transport::{generate_keypair, Client};

struct Phone {
    id: String,
    client: Client,
    send: mpsc::Sender<Vec<u8>>,
    receive: mpsc::Receiver<Vec<u8>>,
    task: tokio::task::JoinHandle<Result<(), String>>,
}
impl Phone {
    async fn start(shared: Arc<Shared>, key: &[u8], origin: Origin) -> Self {
        let host = hex::decode(shared.identity.lock().unwrap().id()).unwrap();
        let mut client = Client::new(&key[..32], &host).unwrap();
        let (send, input) = mpsc::channel(32);
        let (output, receive) = mpsc::channel(32);
        let task = tokio::spawn(connection::run_from(shared, input, output, origin));
        send.send(
            client
                .start(br#"{"protocol":1,"deviceName":"Phone"}"#)
                .unwrap(),
        )
        .await
        .unwrap();
        Self {
            id: hex::encode(&key[32..]),
            client,
            send,
            receive,
            task,
        }
    }
    async fn hello(&mut self) -> Value {
        let frame = tokio::time::timeout(Duration::from_secs(2), self.receive.recv())
            .await
            .unwrap()
            .unwrap();
        serde_json::from_slice(&self.client.finish(&frame).unwrap()).unwrap()
    }
    async fn state(&mut self) {
        self.send
            .send(
                self.client
                    .encrypt(br#"{"id":"one","method":"host.state","params":{}}"#)
                    .unwrap(),
            )
            .await
            .unwrap();
        let frame = tokio::time::timeout(Duration::from_secs(2), self.receive.recv())
            .await
            .unwrap()
            .unwrap();
        let result: Value = serde_json::from_slice(&self.client.decrypt(&frame).unwrap()).unwrap();
        assert_eq!(result["ok"], true, "{result}");
    }
}
async fn pending(shared: &Shared, id: &str) {
    for _ in 0..200 {
        if shared.pending.lock().unwrap().contains_key(id) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    panic!("No local approval request");
}

#[tokio::test]
async fn known_nearby_device_needs_fresh_local_approval_and_denial_keeps_it_disconnected() {
    let (_dir, shared) = nearby_state();
    let key = generate_keypair().unwrap();
    let id = hex::encode(&key[32..]);
    shared.trust(&id, "Known phone").unwrap();
    let mut phone = Phone::start(shared.clone(), &key, Origin::Nearby("127.0.0.1".into())).await;
    pending(&shared, &phone.id).await;
    assert!(shared.active.lock().unwrap().is_empty());
    assert!(phone.receive.try_recv().is_err());
    shared.answer(&id, false).unwrap();
    assert_eq!(phone.hello().await["ok"], false);
    assert!(phone.task.await.unwrap().is_err());
    assert!(
        shared.trusted(&id),
        "denying a session does not revoke an approved device"
    );
    let mut next = Phone::start(shared.clone(), &key, Origin::Nearby("127.0.0.1".into())).await;
    pending(&shared, &id).await;
    shared.answer(&id, true).unwrap();
    assert_eq!(next.hello().await["ok"], true);
    next.state().await;
    next.task.abort();
}

#[tokio::test]
async fn explicit_trusted_mode_persists_and_disabled_mode_terminates_and_denies() {
    let (dir, shared) = nearby_state();
    let key = generate_keypair().unwrap();
    shared.trust(&hex::encode(&key[32..]), "Phone").unwrap();
    shared.set_lan_mode(LanMode::Trusted).unwrap();
    let loaded = crate::identity::Identity::load(&dir.path().join("state"), None).unwrap();
    assert_eq!(loaded.lan_mode.name(), "trusted");
    let mut phone = Phone::start(shared.clone(), &key, Origin::Nearby("127.0.0.1".into())).await;
    assert_eq!(phone.hello().await["ok"], true);
    assert!(shared.pending.lock().unwrap().is_empty());
    phone.state().await;
    shared.set_lan_mode(LanMode::Disabled).unwrap();
    tokio::time::timeout(Duration::from_secs(2), phone.task)
        .await
        .unwrap()
        .unwrap()
        .ok();
    assert!(shared.active.lock().unwrap().is_empty());
    let mut denied = Phone::start(shared.clone(), &key, Origin::Nearby("127.0.0.1".into())).await;
    assert_eq!(denied.hello().await["ok"], false);
    assert!(denied.task.await.unwrap().is_err());
    assert!(shared.pending.lock().unwrap().is_empty());
}

#[tokio::test]
async fn cloud_approval_does_not_also_request_nearby_approval() {
    let (_dir, shared) = nearby_state();
    let key = generate_keypair().unwrap();
    shared.trust(&hex::encode(&key[32..]), "Phone").unwrap();
    assert_eq!(shared.lan_mode().unwrap().name(), "ask");
    let mut phone = Phone::start(shared.clone(), &key, Origin::Cloud).await;
    assert_eq!(phone.hello().await["ok"], true);
    assert!(shared.pending.lock().unwrap().is_empty());
    phone.state().await;
    phone.task.abort();
}

#[test]
fn legacy_identity_without_a_mode_defaults_to_ask_and_invalid_mode_is_rejected() {
    let (dir, shared) = nearby_state();
    let path = dir.path().join("state/identity.json");
    let mut value: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    value.as_object_mut().unwrap().remove("lan_mode");
    std::fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
    assert_eq!(
        crate::identity::Identity::load(path.parent().unwrap(), None)
            .unwrap()
            .lan_mode
            .name(),
        "ask"
    );
    assert!(LanMode::parse("always").is_err());
    assert_eq!(shared.lan_mode().unwrap().name(), "ask");
}

#[tokio::test]
async fn delayed_confirmation_cannot_cross_an_ask_to_ask_account_reset() {
    let (_dir, shared) = nearby_state();
    let key = generate_keypair().unwrap();
    let mut phone = Phone::start(shared.clone(), &key, Origin::Nearby("127.0.0.1".into())).await;
    pending(&shared, &phone.id).await;
    shared.answer(&phone.id, true).unwrap();
    assert_eq!(phone.hello().await["ok"], true);
    assert!(shared.active.lock().unwrap().is_empty());
    shared.set_lan_mode(LanMode::Ask).unwrap();
    phone
        .send
        .send(
            phone
                .client
                .encrypt(br#"{"id":"late","method":"host.state"}"#)
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(tokio::time::timeout(Duration::from_secs(2), phone.task)
        .await
        .unwrap()
        .unwrap()
        .is_err());
    assert!(shared.active.lock().unwrap().is_empty());
    let mut pending_phone =
        Phone::start(shared.clone(), &key, Origin::Nearby("127.0.0.1".into())).await;
    pending(&shared, &pending_phone.id).await;
    shared.set_lan_mode(LanMode::Ask).unwrap();
    assert!(shared.pending.lock().unwrap().is_empty());
    assert_eq!(pending_phone.hello().await["ok"], false);
    assert!(pending_phone.task.await.unwrap().is_err());
}

#[path = "lan_revocation_tests.rs"]
mod revocation;
