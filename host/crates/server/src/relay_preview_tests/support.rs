use crate::relay_test_support::b64;
use crate::{Backend, PreviewFrame as Frame, PreviewHandler};
use futures_util::SinkExt;
use serde_json::{json, Value};
use std::sync::{mpsc, Arc, Mutex};
use tokio_tungstenite::tungstenite::Message;

struct EchoPreview {
    source: Mutex<Option<mpsc::Receiver<Frame>>>,
    send: mpsc::SyncSender<Frame>,
}
impl PreviewHandler for EchoPreview {
    fn receive(&self, _: &str, frame: Frame) -> Result<(), String> {
        match frame {
            Frame::Open { key } => self
                .send
                .send(Frame::Credit { key, total: 65536 })
                .map_err(|e| e.to_string()),
            Frame::Data { key, bytes, .. } => {
                self.send
                    .send(Frame::Open { key })
                    .map_err(|e| e.to_string())?;
                self.send
                    .send(Frame::Data {
                        key,
                        sequence: 0,
                        bytes,
                    })
                    .map_err(|e| e.to_string())
            }
            _ => Ok(()),
        }
    }
    fn subscribe(&self, _: &str) -> mpsc::Receiver<Frame> {
        self.source.lock().unwrap().take().unwrap()
    }
    fn disconnected(&self, _: &str) {}
}
struct RelayPreviewBackend {
    preview: Arc<EchoPreview>,
    events: Mutex<Option<mpsc::Receiver<Value>>>,
    _event_send: mpsc::Sender<Value>,
}
impl Backend for RelayPreviewBackend {
    fn handle(&self, _: &str, method: &str, _: Value) -> Result<Value, String> {
        Ok(json!({"method":method}))
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        self.events.lock().unwrap().take().unwrap()
    }
    fn preview(&self, _: &str) -> Option<Arc<dyn PreviewHandler>> {
        Some(self.preview.clone())
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "Relay Preview test"
    }
}

pub(super) fn backend() -> Arc<dyn Backend> {
    let (preview_send, preview_source) = mpsc::sync_channel(8);
    let (event_send, event_source) = mpsc::channel();
    Arc::new(RelayPreviewBackend {
        preview: Arc::new(EchoPreview {
            source: Mutex::new(Some(preview_source)),
            send: preview_send,
        }),
        events: Mutex::new(Some(event_source)),
        _event_send: event_send,
    })
}

pub(super) async fn send_envelope<S>(relay: &mut S, ciphertext: &[u8])
where
    S: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    relay
        .send(Message::Text(
            json!({"type":"frame","clientId":"phone-1","data":b64(ciphertext)})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
}
