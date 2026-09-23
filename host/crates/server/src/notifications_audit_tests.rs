use crate::{notifications, Backend};
use serde_json::{json, Value};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

fn event(state: &str, item: Value) -> Value {
    json!({"event":"conversation.updated","data":{"sessionId":"session","generation":"generation",
        "turnId":"turn","cursor":4,"turnState":state,"item":item}})
}
#[test]
fn resolved_waiting_item_invalidates_an_earlier_approval_alert() {
    let resolved = event("waiting", json!({"kind":"permission","status":"accepted"}));
    assert_eq!(
        notifications::metadata(&resolved).map(|v| v["phase"].clone()),
        Some(json!("unavailable")),
        "The server must learn that the earlier actionable observation is no longer current"
    );
}
struct Feed(Mutex<Option<mpsc::Receiver<Value>>>);
impl Backend for Feed {
    fn handle(&self, _: &str, _: &str, _: Value) -> Result<Value, String> {
        Err("not used".into())
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        self.0
            .lock()
            .unwrap()
            .take()
            .unwrap_or_else(|| mpsc::channel().1)
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "test"
    }
}
#[tokio::test]
async fn publisher_coalesces_obsolete_approval_before_sending_and_stops_when_dropped() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("spool.json");
    std::fs::write(&path, b"old offline private data must never be replayed").unwrap();
    let (tx, rx) = mpsc::channel();
    let backend = Arc::new(Feed(Mutex::new(Some(rx))));
    let (sent_tx, mut sent_rx) = tokio::sync::mpsc::unbounded_channel();
    let send: notifications::NotificationSender = Arc::new(move |events| {
        let sent_tx = sent_tx.clone();
        Box::pin(async move {
            sent_tx.send(events).unwrap();
            Ok(())
        })
    });
    let handle = notifications::start(backend, path, send);
    tx.send(event(
        "waiting",
        json!({"kind":"permission","status":"pending","command":"SECRET"}),
    ))
    .unwrap();
    tx.send(event("completed", Value::Null)).unwrap();
    let batch = tokio::time::timeout(Duration::from_secs(5), sent_rx.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(batch.len(), 1);
    assert_eq!(batch[0]["phase"], "reply_ready");
    assert!(!serde_json::to_string(&batch).unwrap().contains("SECRET"));
    drop(handle);
    let _ = tx.send(event("failed", Value::Null));
    assert!(tokio::time::timeout(Duration::from_secs(3), sent_rx.recv())
        .await
        .ok()
        .flatten()
        .is_none());
}
/// The spool is written when it changes, not rewritten every two seconds.
#[cfg(unix)]
#[tokio::test]
async fn an_unchanged_spool_is_not_written_again() {
    use std::os::unix::fs::MetadataExt;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("spool.json");
    std::fs::write(&path, b"left by an earlier run").unwrap();
    let (_tx, rx) = mpsc::channel::<Value>();
    let backend = Arc::new(Feed(Mutex::new(Some(rx))));
    let send: notifications::NotificationSender = Arc::new(|_| Box::pin(async { Ok(()) }));
    let _handle = notifications::start(backend, path.clone(), send);
    let replaced = async {
        while std::fs::read(&path).unwrap() != b"{}" {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    };
    tokio::time::timeout(Duration::from_secs(5), replaced)
        .await
        .expect("the first pass replaces what an earlier run left");
    let written = std::fs::metadata(&path).unwrap().ino();
    tokio::time::sleep(Duration::from_millis(4500)).await;
    assert_eq!(std::fs::metadata(&path).unwrap().ino(), written);
}
