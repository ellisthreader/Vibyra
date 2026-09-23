use crate::{
    backend::{Backend, PreviewHandler},
    connection,
    test_support::state_with_backend,
};
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use tokio::{sync::mpsc as async_mpsc, task::JoinHandle};
use vibyra_transport::{
    generate_keypair,
    preview::{Frame, StreamKey},
    Client,
};

struct Probe {
    source: Mutex<Option<mpsc::Receiver<Frame>>>,
    sent: mpsc::SyncSender<Frame>,
    received: Mutex<Vec<Frame>>,
    disconnected: AtomicBool,
}
impl PreviewHandler for Probe {
    fn receive(&self, _: &str, frame: Frame) -> Result<(), String> {
        self.received.lock().unwrap().push(frame);
        Ok(())
    }
    fn subscribe(&self, _: &str) -> mpsc::Receiver<Frame> {
        self.source
            .lock()
            .unwrap()
            .take()
            .unwrap_or_else(|| mpsc::channel().1)
    }
    fn disconnected(&self, _: &str) {
        self.disconnected.store(true, Ordering::SeqCst);
    }
}
struct TestBackend {
    probe: Option<Arc<Probe>>,
    preview_queries: AtomicUsize,
    events: Mutex<Option<mpsc::Receiver<Value>>>,
    _event_sender: mpsc::Sender<Value>,
    extra_events: Mutex<Vec<mpsc::Sender<Value>>>,
}
impl TestBackend {
    fn new(enabled: bool) -> (Arc<Self>, Arc<Probe>) {
        let (sent, source) = mpsc::sync_channel(8);
        let probe = Arc::new(Probe {
            source: Mutex::new(Some(source)),
            sent,
            received: Mutex::new(Vec::new()),
            disconnected: AtomicBool::new(false),
        });
        let (event_sender, events) = mpsc::channel();
        (
            Arc::new(Self {
                probe: enabled.then_some(probe.clone()),
                preview_queries: AtomicUsize::new(0),
                events: Mutex::new(Some(events)),
                _event_sender: event_sender,
                extra_events: Mutex::new(Vec::new()),
            }),
            probe,
        )
    }
}
impl Backend for TestBackend {
    fn handle(&self, _: &str, method: &str, _: Value) -> Result<Value, String> {
        Ok(json!({"method": method}))
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        if let Some(events) = self.events.lock().unwrap().take() {
            return events;
        }
        let (sender, events) = mpsc::channel();
        self.extra_events.lock().unwrap().push(sender);
        events
    }
    fn preview(&self, _: &str) -> Option<Arc<dyn PreviewHandler>> {
        self.preview_queries.fetch_add(1, Ordering::SeqCst);
        self.probe
            .as_ref()
            .map(|probe| probe.clone() as Arc<dyn PreviewHandler>)
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "test"
    }
}
struct Connected {
    _dir: tempfile::TempDir,
    shared: Arc<crate::state::Shared>,
    device: String,
    client: Client,
    input: async_mpsc::Sender<Vec<u8>>,
    output: async_mpsc::Receiver<Vec<u8>>,
    task: JoinHandle<Result<(), String>>,
}
async fn connect(backend: Arc<TestBackend>) -> Connected {
    let (dir, shared) = state_with_backend(backend);
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    shared.trust(&device, "Trusted phone").unwrap();
    let host = hex::decode(&shared.identity.lock().unwrap().public_key).unwrap();
    let mut client = Client::new(&key[..32], &host).unwrap();
    let (input, receiver) = async_mpsc::channel(32);
    let (sender, mut output) = async_mpsc::channel(32);
    let task = tokio::spawn(connection::run(shared.clone(), receiver, sender));
    input
        .send(
            client
                .start(br#"{"protocol":1,"deviceName":"Phone"}"#)
                .unwrap(),
        )
        .await
        .unwrap();
    let reply: Value =
        serde_json::from_slice(&client.finish(&output.recv().await.unwrap()).unwrap()).unwrap();
    assert_eq!(reply["ok"], true);
    Connected {
        _dir: dir,
        shared,
        device,
        client,
        input,
        output,
        task,
    }
}
async fn send(connected: &mut Connected, plain: &[u8]) {
    connected
        .input
        .send(connected.client.encrypt(plain).unwrap())
        .await
        .unwrap();
}
async fn next(connected: &mut Connected) -> Vec<u8> {
    let encrypted = tokio::time::timeout(Duration::from_secs(2), connected.output.recv())
        .await
        .unwrap()
        .unwrap();
    connected.client.decrypt(&encrypted).unwrap()
}

#[tokio::test]
async fn preview_is_unavailable_before_auth_and_default_denial_keeps_rpc_alive() {
    let (backend, _) = TestBackend::new(false);
    let mut connected = connect(backend.clone()).await;
    let key = StreamKey::new(1, 1).unwrap();
    send(&mut connected, &Frame::Open { key }.encode().unwrap()).await;
    assert_eq!(
        Frame::decode(&next(&mut connected).await).unwrap(),
        Frame::Cancel { key }
    );
    send(&mut connected, br#"{"id":"rpc","method":"host.state"}"#).await;
    let reply: Value = serde_json::from_slice(&next(&mut connected).await).unwrap();
    assert_eq!(reply["id"], "rpc");
    assert_eq!(backend.preview_queries.load(Ordering::SeqCst), 1);
    connected.task.abort();

    let (backend, _) = TestBackend::new(true);
    let (_, shared) = state_with_backend(backend.clone());
    let phone = generate_keypair().unwrap();
    let host = hex::decode(&shared.identity.lock().unwrap().public_key).unwrap();
    let mut client = Client::new(&phone[..32], &host).unwrap();
    let (input, receiver) = async_mpsc::channel(1);
    let (sender, mut output) = async_mpsc::channel(1);
    let task = tokio::spawn(connection::run(shared, receiver, sender));
    input
        .send(
            client
                .start(&Frame::Open { key }.encode().unwrap())
                .unwrap(),
        )
        .await
        .unwrap();
    let refusal: Value =
        serde_json::from_slice(&client.finish(&output.recv().await.unwrap()).unwrap()).unwrap();
    assert_eq!(refusal["ok"], false);
    assert_eq!(backend.preview_queries.load(Ordering::SeqCst), 0);
    assert!(task.await.unwrap().is_err());
}

#[path = "preview_connection_tests/traffic.rs"]
mod traffic;
#[path = "preview_connection_tests/upgrade.rs"]
mod upgrade;
