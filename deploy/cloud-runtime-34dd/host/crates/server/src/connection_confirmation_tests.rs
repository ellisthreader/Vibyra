//! A captured IK opener is not proof of a live phone. The first transport
//! message confirms the responder's fresh ephemeral key before any content.
use crate::{backend::Backend, connection, test_support::state_with_backend};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::Duration;
use vibyra_transport::{generate_keypair, Client};

#[derive(Default)]
struct SensitiveBackend {
    connected: AtomicUsize,
    subscribed: AtomicUsize,
    events: Mutex<Vec<mpsc::Sender<Value>>>,
}
impl Backend for SensitiveBackend {
    fn connected(&self, _: &str, _: u64) {
        self.connected.fetch_add(1, Ordering::SeqCst);
    }
    fn handle(&self, _: &str, _: &str, _: Value) -> Result<Value, String> {
        Ok(json!({}))
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        self.subscribed.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = mpsc::channel();
        sender
            .send(json!({"event":"terminal.output","data":{"output":"sensitive fixture"}}))
            .unwrap();
        self.events.lock().unwrap().push(sender);
        receiver
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "Test"
    }
}

#[tokio::test]
async fn captured_handshake_cannot_subscribe_or_take_over_a_live_device() {
    let backend = Arc::new(SensitiveBackend::default());
    let (_dir, shared) = state_with_backend(backend.clone());
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    shared.trust(&device, "Test phone").unwrap();
    let host = hex::decode(shared.identity.lock().unwrap().public_key.clone()).unwrap();
    let mut client = Client::new(&key[..32], &host).unwrap();
    let opener = client
        .start(br#"{"protocol":1,"deviceName":"Phone"}"#)
        .unwrap();
    let (input, receiver) = tokio::sync::mpsc::channel(32);
    let (sender, mut output) = tokio::sync::mpsc::channel(32);
    let live = tokio::spawn(connection::run(shared.clone(), receiver, sender));
    input.send(opener.clone()).await.unwrap();
    client.finish(&output.recv().await.unwrap()).unwrap();
    assert!(shared.active.lock().unwrap().is_empty());
    assert!(shared.identity.lock().unwrap().devices[&device]
        .last_seen
        .is_none());
    assert!(
        tokio::time::timeout(Duration::from_millis(80), output.recv())
            .await
            .is_err()
    );
    assert_eq!(backend.connected.load(Ordering::SeqCst), 0);
    assert_eq!(backend.subscribed.load(Ordering::SeqCst), 0);
    let confirmation = client
        .encrypt(br#"{"id":"one","method":"host.state","params":{}}"#)
        .unwrap();
    input.send(confirmation.clone()).await.unwrap();
    let mut reply = false;
    let mut event = false;
    for _ in 0..2 {
        let frame = tokio::time::timeout(Duration::from_secs(2), output.recv())
            .await
            .unwrap()
            .unwrap();
        let value: Value = serde_json::from_slice(&client.decrypt(&frame).unwrap()).unwrap();
        reply |= value["id"] == "one";
        event |= value["event"] == "terminal.output";
    }
    assert!(reply && event);
    let active = shared.active.lock().unwrap().get(&device).unwrap().clone();
    let (attack, receiver) = tokio::sync::mpsc::channel(32);
    let (sender, mut output) = tokio::sync::mpsc::channel(32);
    let replay = tokio::spawn(connection::run(shared.clone(), receiver, sender));
    attack.send(opener).await.unwrap();
    output.recv().await.unwrap(); // Only the non-content handshake response.
    assert!(
        tokio::time::timeout(Duration::from_millis(80), output.recv())
            .await
            .is_err()
    );
    assert_eq!(backend.connected.load(Ordering::SeqCst), 1);
    assert_eq!(backend.subscribed.load(Ordering::SeqCst), 1);
    assert!(Arc::ptr_eq(
        shared.active.lock().unwrap().get(&device).unwrap(),
        &active
    ));
    attack.send(confirmation).await.unwrap();
    assert!(tokio::time::timeout(Duration::from_secs(2), replay)
        .await
        .unwrap()
        .unwrap()
        .is_err());
    assert!(!live.is_finished());
    live.abort();
}
