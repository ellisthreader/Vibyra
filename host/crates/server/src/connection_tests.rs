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
    assert!(!shared.active.lock().unwrap().contains_key(&device));
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

/// A phone whose Wi-Fi went can be back before this Host has noticed the socket
/// it left, so the returning connection has to displace that one rather than be
/// told the device is already connected — nothing else could clear it.
#[tokio::test]
async fn a_returning_device_replaces_the_connection_it_left_behind() {
    let probe = std::sync::Arc::new(ConnectionProbe::default());
    let (_dir, shared) = crate::test_support::state_with_backend(probe.clone());
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    shared.trust(&device, "Trusted test phone").unwrap();
    let host = hex::decode(&shared.identity.lock().unwrap().public_key).unwrap();
    let hello = br#"{"protocol":1,"deviceName":"Phone"}"#;

    let mut stale = Client::new(&key[..32], &host).unwrap();
    let (stale_input, receiver) = mpsc::channel(32);
    let (sender, mut stale_output) = mpsc::channel(32);
    let abandoned = tokio::spawn(connection::run(shared.clone(), receiver, sender));
    stale_input.send(stale.start(hello).unwrap()).await.unwrap();
    let opened: Value =
        serde_json::from_slice(&stale.finish(&stale_output.recv().await.unwrap()).unwrap())
            .unwrap();
    assert_eq!(opened["ok"], true);
    stale_input
        .send(
            stale
                .encrypt(br#"{"id":"old","method":"host.state","params":{}}"#)
                .unwrap(),
        )
        .await
        .unwrap();
    stale.decrypt(&stale_output.recv().await.unwrap()).unwrap();

    let mut returning = Client::new(&key[..32], &host).unwrap();
    let (input, receiver) = mpsc::channel(32);
    let (sender, mut output) = mpsc::channel(32);
    let task = tokio::spawn(connection::run(shared.clone(), receiver, sender));
    input.send(returning.start(hello).unwrap()).await.unwrap();
    let reply: Value =
        serde_json::from_slice(&returning.finish(&output.recv().await.unwrap()).unwrap()).unwrap();
    assert_eq!(reply["ok"], true, "the phone that came back was refused");
    assert_eq!(reply["deviceId"], device);
    // A handshake alone cannot displace the old socket: the returning phone
    // first proves it received this responder's fresh ephemeral contribution.
    assert_eq!(probe.opened.lock().unwrap().len(), 1);
    input
        .send(
            returning
                .encrypt(br#"{"id":"new","method":"host.state","params":{}}"#)
                .unwrap(),
        )
        .await
        .unwrap();
    returning.decrypt(&output.recv().await.unwrap()).unwrap();
    let opened = probe.opened.lock().unwrap().clone();
    assert_eq!(opened.len(), 2);
    assert_ne!(
        opened[0], opened[1],
        "a replacement socket must have a new identity"
    );

    let ended = tokio::time::timeout(std::time::Duration::from_secs(2), abandoned)
        .await
        .expect("the abandoned connection was left running");
    assert!(ended.unwrap().is_ok());

    // The workspace answers on the connection the phone is actually holding,
    // and the slot the departing one gave up is still this device's.
    input
        .send(
            returning
                .encrypt(br#"{"id":"one","method":"host.state","params":{}}"#)
                .unwrap(),
        )
        .await
        .unwrap();
    let state: Value =
        serde_json::from_slice(&returning.decrypt(&output.recv().await.unwrap()).unwrap()).unwrap();
    assert_eq!(state["result"]["host"]["name"], "Test computer");
    assert!(shared.active.lock().unwrap().contains_key(&device));
    assert_eq!(
        probe.handled.lock().unwrap().as_slice(),
        &[opened[0], opened[1], opened[1]]
    );
    task.abort();
}

#[derive(Default)]
struct ConnectionProbe {
    opened: std::sync::Mutex<Vec<u64>>,
    handled: std::sync::Mutex<Vec<u64>>,
    events: std::sync::Mutex<Vec<std::sync::mpsc::Sender<Value>>>,
}
impl crate::backend::Backend for ConnectionProbe {
    fn connected(&self, _: &str, connection: u64) {
        self.opened.lock().unwrap().push(connection);
    }
    fn handle_on_connection(
        &self,
        _: &str,
        connection: u64,
        _: &str,
        _: Value,
    ) -> Result<Value, String> {
        assert_eq!(self.opened.lock().unwrap().last(), Some(&connection));
        self.handled.lock().unwrap().push(connection);
        Ok(json!({"sessions":[],"projects":[],"capabilities":{}}))
    }
    fn handle(&self, _: &str, _: &str, _: Value) -> Result<Value, String> {
        panic!("Connection identity was lost")
    }
    fn subscribe(&self) -> std::sync::mpsc::Receiver<Value> {
        let (sender, receiver) = std::sync::mpsc::channel();
        self.events.lock().unwrap().push(sender);
        receiver
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "Test connection identity"
    }
}
