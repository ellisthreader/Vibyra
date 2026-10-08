use crate::Backend;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::{
    sync::{mpsc, Mutex},
    time::Duration,
};
use tokio_tungstenite::tungstenite::Message;

#[derive(Default)]
pub struct ViewBackend(Mutex<Vec<mpsc::Sender<Value>>>);
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

pub fn b64(bytes: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    STANDARD.encode(bytes)
}
pub fn unb64(text: &str) -> Vec<u8> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    STANDARD.decode(text).unwrap()
}

pub async fn next_frame<S>(relay: &mut S) -> String
where
    S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    loop {
        let message = tokio::time::timeout(Duration::from_secs(3), relay.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        if let Message::Text(text) = message {
            let value: Value = serde_json::from_str(&text).unwrap();
            assert_eq!(value["type"], "frame", "{value}");
            return value["data"].as_str().unwrap().to_string();
        }
    }
}
