use super::*;
pub(super) struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}
#[derive(Default)]
pub(super) struct View(Mutex<Vec<mpsc::Sender<Value>>>);
impl Backend for View {
    fn handle(&self, _: &str, _: &str, _: Value) -> Result<Value, String> {
        Ok(json!({}))
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        let (send, receive) = mpsc::channel();
        self.0.lock().unwrap().push(send);
        receive
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "Test"
    }
}
type Relay = WebSocketStream<TcpStream>;
pub(super) async fn send(relay: &mut Relay, value: Value) {
    relay
        .send(Message::Text(value.to_string().into()))
        .await
        .unwrap();
}
pub(super) async fn next(relay: &mut Relay) -> Value {
    loop {
        match timeout(Duration::from_secs(3), relay.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap()
        {
            Message::Text(text) => return serde_json::from_str(&text).unwrap(),
            Message::Ping(data) => relay.send(Message::Pong(data)).await.unwrap(),
            other => panic!("unexpected relay frame {other:?}"),
        }
    }
}
pub(super) async fn frame(relay: &mut Relay, bytes: Vec<u8>) {
    send(
        relay,
        json!({"type":"frame","clientId":"phone","data":STANDARD.encode(bytes)}),
    )
    .await;
}
