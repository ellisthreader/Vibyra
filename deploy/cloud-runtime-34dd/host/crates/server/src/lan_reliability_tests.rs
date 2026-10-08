//! A phone waiting for approval is told, and one failed security sync no
//! longer ends every live connection.
use crate::{
    connection::{self, APPROVAL_PENDING},
    remote_authorization::now,
    restriction_apply::SYNC_GRACE,
    state::Origin,
    test_support::nearby_state,
};
use serde_json::{json, Value};
use std::{sync::atomic::Ordering, time::Duration};
use tokio::sync::mpsc;
use vibyra_transport::{generate_keypair, Client};

async fn frame(receive: &mut mpsc::Receiver<Vec<u8>>) -> Vec<u8> {
    tokio::time::timeout(Duration::from_secs(2), receive.recv())
        .await
        .unwrap()
        .unwrap()
}

#[tokio::test]
async fn a_phone_that_reads_the_notice_hears_it_is_waiting_for_approval() {
    let (_dir, shared) = nearby_state();
    let key = generate_keypair().unwrap();
    let id = hex::encode(&key[32..]);
    let host = hex::decode(shared.identity.lock().unwrap().id()).unwrap();
    let mut client = Client::new(&key[..32], &host).unwrap();
    let (send, input) = mpsc::channel(32);
    let (output, mut receive) = mpsc::channel(32);
    let origin = Origin::Nearby("192.168.1.2".into());
    tokio::spawn(connection::run_nearby(
        shared.clone(),
        input,
        output,
        origin,
        true,
    ));
    send.send(
        client
            .start(br#"{"protocol":1,"deviceName":"Phone"}"#)
            .unwrap(),
    )
    .await
    .unwrap();
    // The notice comes first, while the computer still shows the request.
    assert_eq!(frame(&mut receive).await, APPROVAL_PENDING);
    assert!(shared.pending.lock().unwrap().contains_key(&id));
    shared.answer(&id, true).unwrap();
    let reply: Value =
        serde_json::from_slice(&client.finish(&frame(&mut receive).await).unwrap()).unwrap();
    assert_eq!(reply["ok"], true, "{reply}");
    // The notice can never be mistaken for a Noise reply.
    assert!(APPROVAL_PENDING.len() < 48);

    // Connected: a liveness probe is answered without becoming a request.
    send.send(
        client
            .encrypt(br#"{"id":"s","method":"host.state","params":{}}"#)
            .unwrap(),
    )
    .await
    .unwrap();
    let state: Value =
        serde_json::from_slice(&client.decrypt(&frame(&mut receive).await).unwrap()).unwrap();
    assert_eq!(state["id"], "s");
    send.send(
        client
            .encrypt(br#"{"id":"p","method":"host.ping"}"#)
            .unwrap(),
    )
    .await
    .unwrap();
    let pong: Value =
        serde_json::from_slice(&client.decrypt(&frame(&mut receive).await).unwrap()).unwrap();
    assert_eq!(pong, json!({"id":"p","ok":true,"result":{"alive":true}}));
}

#[tokio::test]
async fn an_older_phone_gets_no_notice_before_its_handshake_reply() {
    let (_dir, shared) = nearby_state();
    let key = generate_keypair().unwrap();
    let id = hex::encode(&key[32..]);
    let host = hex::decode(shared.identity.lock().unwrap().id()).unwrap();
    let mut client = Client::new(&key[..32], &host).unwrap();
    let (send, input) = mpsc::channel(32);
    let (output, mut receive) = mpsc::channel(32);
    let origin = Origin::Nearby("192.168.1.2".into());
    tokio::spawn(connection::run_nearby(
        shared.clone(),
        input,
        output,
        origin,
        false,
    ));
    send.send(
        client
            .start(br#"{"protocol":1,"deviceName":"Phone"}"#)
            .unwrap(),
    )
    .await
    .unwrap();
    for _ in 0..200 {
        if shared.pending.lock().unwrap().contains_key(&id) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    assert!(receive.try_recv().is_err());
    shared.answer(&id, true).unwrap();
    let reply: Value =
        serde_json::from_slice(&client.finish(&frame(&mut receive).await).unwrap()).unwrap();
    assert_eq!(reply["ok"], true, "{reply}");
}

#[test]
fn one_failed_security_sync_keeps_live_phones_until_the_grace_runs_out() {
    let (_dir, shared) = nearby_state();
    shared.policy_pending.store(false, Ordering::SeqCst);
    let generation = shared.lan_generation.load(Ordering::SeqCst);
    // First failure: new nearby phones are asked again, live ones stay.
    shared.suspend_restrictions();
    assert!(shared.policy_pending.load(Ordering::SeqCst));
    assert_eq!(shared.lan_generation.load(Ordering::SeqCst), generation);
    shared.suspend_restrictions();
    assert_eq!(shared.lan_generation.load(Ordering::SeqCst), generation);
    // Still failing after the grace: live connections end, once.
    shared
        .policy_failing_since
        .store(now() - SYNC_GRACE - 1, Ordering::SeqCst);
    shared.suspend_restrictions();
    assert_eq!(shared.lan_generation.load(Ordering::SeqCst), generation + 1);
    shared.suspend_restrictions();
    assert_eq!(shared.lan_generation.load(Ordering::SeqCst), generation + 1);
}

#[test]
fn a_sync_that_was_never_confirmed_does_not_start_the_grace_clock() {
    let (_dir, shared) = nearby_state();
    shared.policy_pending.store(true, Ordering::SeqCst);
    let generation = shared.lan_generation.load(Ordering::SeqCst);
    shared.suspend_restrictions();
    assert_eq!(shared.policy_failing_since.load(Ordering::SeqCst), 0);
    assert_eq!(shared.lan_generation.load(Ordering::SeqCst), generation);
}
