use crate::{backend::Backend, connection, test_support::state_with_backend};
use serde_json::{json, Value};
use std::{
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use vibyra_transport::{generate_keypair, Client};

/// A backend whose `slow` request waits to be released, fed events by hand.
struct Staged {
    events: Mutex<Option<mpsc::Receiver<Value>>>,
    release: Mutex<mpsc::Receiver<()>>,
}
impl Backend for Staged {
    fn handle(&self, _: &str, method: &str, _: Value) -> Result<Value, String> {
        if method == "slow" {
            let release = self.release.lock().unwrap();
            release
                .recv_timeout(Duration::from_secs(5))
                .map_err(|_| "never released")?;
        }
        Ok(json!({"method":method}))
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        self.events
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

async fn next(client: &mut Client, output: &mut tokio::sync::mpsc::Receiver<Vec<u8>>) -> Value {
    let frame = tokio::time::timeout(Duration::from_secs(2), output.recv())
        .await
        .expect("nothing reached the phone")
        .expect("connection closed");
    serde_json::from_slice(&client.decrypt(&frame).unwrap()).unwrap()
}

/// A request that takes seconds used to hold every event behind it, so the
/// phone's terminals froze until it answered. Terminal output keeps flowing
/// now, the requests are still answered in the order they were sent, and the
/// liveness-only heartbeats never reach the phone at all.
#[tokio::test]
async fn a_slow_request_leaves_events_flowing_and_replies_in_order() {
    let (events, feed) = mpsc::channel();
    let (release, wait) = mpsc::channel();
    let (_dir, shared) = state_with_backend(Arc::new(Staged {
        events: Mutex::new(Some(feed)),
        release: Mutex::new(wait),
    }));
    let key = generate_keypair().unwrap();
    let device = hex::encode(&key[32..]);
    shared.trust(&device, "Trusted test phone").unwrap();
    let host = hex::decode(&shared.identity.lock().unwrap().public_key).unwrap();
    let mut client = Client::new(&key[..32], &host).unwrap();
    let (input, receiver) = tokio::sync::mpsc::channel(32);
    let (sender, mut output) = tokio::sync::mpsc::channel(32);
    let task = tokio::spawn(connection::run(shared, receiver, sender));
    let hello = br#"{"protocol":1,"deviceName":"Phone"}"#;
    input.send(client.start(hello).unwrap()).await.unwrap();
    client.finish(&output.recv().await.unwrap()).unwrap();
    for (id, method) in [("1", "slow"), ("2", "fast")] {
        let request = json!({"id":id,"method":method,"params":{}}).to_string();
        let frame = client.encrypt(request.as_bytes()).unwrap();
        input.send(frame).await.unwrap();
    }
    events
        .send(json!({"event":"desktop.heartbeat","seq":1,"data":{}}))
        .unwrap();
    events
        .send(json!({"event":"shared.pulse","data":{}}))
        .unwrap();
    events
        .send(json!({"event":"terminal.output","data":{"output":"live"}}))
        .unwrap();
    let first = next(&mut client, &mut output).await;
    assert_eq!(first["event"], "terminal.output", "{first}");
    release.send(()).unwrap();
    let one = next(&mut client, &mut output).await;
    let two = next(&mut client, &mut output).await;
    assert_eq!(
        (one["id"].clone(), one["result"]["method"].clone()),
        (json!("1"), json!("slow"))
    );
    assert_eq!(
        (two["id"].clone(), two["result"]["method"].clone()),
        (json!("2"), json!("fast"))
    );
    task.abort();
}
