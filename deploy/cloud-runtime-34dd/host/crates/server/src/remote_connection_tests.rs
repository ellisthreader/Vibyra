use crate::{
    backend::Backend,
    relay_peers::Peers,
    remote_test_support::{claims, signed},
    test_support::state_with_backend,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use tokio::sync::mpsc as queue;
use vibyra_transport::{generate_keypair, Client};

#[derive(Default)]
struct Probe {
    calls: Mutex<Vec<String>>,
    events: Mutex<Vec<mpsc::Sender<Value>>>,
}
impl Backend for Probe {
    fn handle(&self, _: &str, method: &str, _: Value) -> Result<Value, String> {
        self.calls.lock().unwrap().push(method.into());
        Ok(
            json!({"sessions":[{"output":"private terminal"}],"projects":[{"path":"private path"}],"capabilities":{}}),
        )
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        let (send, receive) = mpsc::channel();
        send.send(json!({"event":"terminal.output","data":{"output":"private terminal"}}))
            .unwrap();
        self.events.lock().unwrap().push(send);
        receive
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "Test"
    }
}
struct Fixture {
    _dir: tempfile::TempDir,
    shared: Arc<crate::state::Shared>,
    probe: Arc<Probe>,
    peers: Peers,
    receiver: queue::Receiver<Value>,
    client: Client,
    phone_key: Vec<u8>,
    host_key: Vec<u8>,
    claim: Value,
    token: String,
}
impl Fixture {
    async fn new(permissions: &[&str], lifetime: u64) -> Self {
        let probe = Arc::new(Probe::default());
        let (dir, shared) = state_with_backend(probe.clone());
        let host = shared.identity.lock().unwrap().id();
        let phone = generate_keypair().unwrap();
        let device = hex::encode(&phone[32..]);
        shared.trust(&device, "Approved phone").unwrap();
        let mut claim = claims(&host, &device, permissions);
        claim["exp"] = json!(crate::remote_authorization::now() + lifetime);
        let (key, token) = signed(&claim);
        let (sender, receiver) = queue::channel(64);
        let peers = Peers::new(
            shared.clone(),
            sender,
            Some(key),
            Some(crate::remote_test_support::context()),
        );
        let host_key = hex::decode(host).unwrap();
        let client = Client::new(&phone[..32], &host_key).unwrap();
        Self {
            _dir: dir,
            shared,
            probe,
            peers,
            receiver,
            client,
            phone_key: phone,
            host_key,
            claim,
            token,
        }
    }
    async fn handshake(&mut self, id: &str) -> Value {
        self.peers
            .handle(json!({"type":"client.open","clientId":id,"authorization":self.token}))
            .unwrap();
        let hello = json!({"protocol":1,"deviceName":"Test","remoteSessionId":self.claim["sessionId"],"remoteAuthorizationId":self.claim["jti"]});
        let frame = self.client.start(hello.to_string().as_bytes()).unwrap();
        self.send(id, frame);
        let message = self.next().await;
        serde_json::from_slice(
            &self
                .client
                .finish(&STANDARD.decode(message["data"].as_str().unwrap()).unwrap())
                .unwrap(),
        )
        .unwrap()
    }
    fn send(&mut self, id: &str, frame: Vec<u8>) {
        self.peers
            .handle(json!({"type":"frame","clientId":id,"data":STANDARD.encode(frame)}))
            .unwrap();
    }
    async fn next(&mut self) -> Value {
        tokio::time::timeout(Duration::from_secs(3), self.receiver.recv())
            .await
            .unwrap()
            .unwrap()
    }
    async fn request(&mut self, id: &str, method: &str) -> Value {
        let bytes = json!({"id":method,"method":method,"params":{}}).to_string();
        let frame = self.client.encrypt(bytes.as_bytes()).unwrap();
        self.send(id, frame);
        let result = self.next().await;
        serde_json::from_slice(
            &self
                .client
                .decrypt(&STANDARD.decode(result["data"].as_str().unwrap()).unwrap())
                .unwrap(),
        )
        .unwrap()
    }
}
#[tokio::test]
async fn signed_view_grant_cannot_receive_terminal_events_or_dispatch_controls() {
    let mut f = Fixture::new(&["screen:view"], 90).await;
    assert!(f
        .peers
        .handle(json!({"type":"client.open","clientId":"missing"}))
        .is_err());
    assert_eq!(f.handshake("phone").await["ok"], true);
    let state = f.request("phone", "host.state").await;
    assert_eq!(state["result"]["sessions"], json!([]));
    assert_eq!(state["result"]["projects"], json!([]));
    assert!(
        tokio::time::timeout(Duration::from_millis(60), f.receiver.recv())
            .await
            .is_err()
    );
    for method in [
        "session.input",
        "project.read",
        "preview.start",
        "unknown.execute",
    ] {
        assert_eq!(f.request("phone", method).await["ok"], false, "{method}");
    }
    assert_eq!(*f.probe.calls.lock().unwrap(), vec!["host.state"]);
    f.peers.drain();
}
#[tokio::test]
async fn replayed_session_grant_never_displaces_its_confirmed_phone() {
    let mut f = Fixture::new(&["screen:view"], 90).await;
    assert_eq!(f.handshake("first").await["ok"], true);
    assert_eq!(f.request("first", "host.state").await["ok"], true);
    let device = hex::encode(&f.phone_key[32..]);
    let slot = f.shared.active.lock().unwrap()[&device].clone();
    f.client = Client::new(&f.phone_key[..32], &f.host_key).unwrap();
    assert_eq!(f.handshake("replay").await["ok"], true);
    let bytes = f
        .client
        .encrypt(br#"{"id":"try","method":"host.state"}"#)
        .unwrap();
    f.send("replay", bytes);
    let reply = f.next().await;
    assert_eq!(reply["type"], "client.close");
    assert_eq!(reply["clientId"], "replay");
    assert!(Arc::ptr_eq(
        &f.shared.active.lock().unwrap()[&device],
        &slot
    ));
    assert_eq!(*f.probe.calls.lock().unwrap(), vec!["host.state"]);
    f.peers.drain();
}
#[tokio::test]
async fn a_withheld_signed_lease_ends_the_connection_without_waiting_for_relay_close() {
    let mut f = Fixture::new(&["screen:view"], 2).await;
    assert_eq!(f.handshake("phone").await["ok"], true);
    assert_eq!(f.request("phone", "host.state").await["ok"], true);
    let reply = f.next().await;
    assert_eq!(reply["type"], "client.close");
    assert!(f.shared.active.lock().unwrap().is_empty());
}

#[cfg(test)]
#[path = "remote_downgrade_tests.rs"]
mod downgrade;
