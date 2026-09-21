use crate::relay_test_support::ViewBackend;
use crate::{EmbeddedHost, RelayCredentials};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio_tungstenite::{accept_async, tungstenite::Message};

/// Signed out, the leg waits without failing, and connects as soon as
/// credentials exist.
#[tokio::test]
async fn the_leg_waits_for_credentials_and_reports_a_refusal_in_the_relays_words() {
    let dir = tempfile::tempdir().unwrap();
    let host = EmbeddedHost::start(
        dir.path().to_owned(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(ViewBackend::default()),
        "Vibyra Desktop",
    )
    .unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    let ready = Arc::new(Mutex::new(false));
    let gate = ready.clone();
    let leg = host.relay(Arc::new(move || {
        let url = url.clone();
        let gate = gate.clone();
        Box::pin(async move {
            if !*gate.lock().unwrap() {
                return Err("Sign in to Vibyra on this Mac to reach it from anywhere.".into());
            }
            Ok(RelayCredentials {
                url,
                token: "t".repeat(40),
                name: "Mac".into(),
            })
        })
    }));
    for _ in 0..50 {
        if leg.status().state == "waiting" {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(leg.status().state, "waiting");
    assert!(leg.status().error.unwrap().starts_with("Sign in"));
    *ready.lock().unwrap() = true;
    let (stream, _) = tokio::time::timeout(Duration::from_secs(10), listener.accept())
        .await
        .unwrap()
        .unwrap();
    let mut relay = accept_async(stream).await.unwrap();
    let _register = relay.next().await.unwrap().unwrap();
    relay
        .send(Message::Text(
            json!({"type":"error","message":"This computer is not allowed on the relay."})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    for _ in 0..50 {
        if leg.status().state == "error" {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(leg.status().state, "error");
    assert_eq!(
        leg.status().error.as_deref(),
        Some("This computer is not allowed on the relay.")
    );
}
