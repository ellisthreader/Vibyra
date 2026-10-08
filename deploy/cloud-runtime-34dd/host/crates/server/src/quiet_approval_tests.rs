use crate::{
    auth,
    connection::{self, APPROVAL_PENDING},
    lan_authorization::LanMode,
    state::Origin,
    test_support::{nearby_state, token},
};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::sync::mpsc;
use vibyra_transport::{generate_keypair, Client};

#[tokio::test]
async fn quiet_reconnect_never_queues_approval_or_consumes_an_invitation() {
    for (trusted, every_time) in [(false, false), (false, true), (true, true)] {
        let (_dir, shared) = nearby_state();
        let id = "ab".repeat(32);
        if trusted {
            shared.trust(&id, "Known phone").unwrap();
        }
        let invite = token(&shared.invite(None).unwrap());
        let hello =
            json!({"protocol":1,"deviceName":"Phone","invite":invite,"allowApproval":false});
        let result = auth::authenticate_with_notice(
            &shared,
            &id,
            hello.to_string().as_bytes(),
            every_time,
            None,
            || panic!("a quiet reconnect must never announce pending approval"),
        )
        .await;
        assert_eq!(
            result.unwrap_err(),
            "Connect from your phone to request approval"
        );
        assert!(shared.pending.lock().unwrap().is_empty());
        assert!(
            shared.consume_invite(&invite),
            "quiet attempts do not consume invitations"
        );
        assert_eq!(shared.trusted(&id), trusted);
    }
}

#[tokio::test]
async fn encrypted_quiet_reconnect_only_succeeds_with_existing_trust_and_trusted_mode() {
    for (trusted, mode, allowed) in [
        (false, LanMode::Trusted, false),
        (true, LanMode::Ask, false),
        (true, LanMode::Trusted, true),
        (true, LanMode::Disabled, false),
    ] {
        let (_dir, shared) = nearby_state();
        shared.set_lan_mode(mode).unwrap();
        let key = generate_keypair().unwrap();
        let id = hex::encode(&key[32..]);
        if trusted {
            shared.trust(&id, "Known phone").unwrap();
        }
        let host = hex::decode(shared.identity.lock().unwrap().id()).unwrap();
        let mut client = Client::new(&key[..32], &host).unwrap();
        let (send, input) = mpsc::channel(32);
        let (output, mut receive) = mpsc::channel(32);
        let task = tokio::spawn(connection::run_nearby(
            shared.clone(),
            input,
            output,
            Origin::Nearby("127.0.0.1".into()),
            true,
        ));
        send.send(
            client
                .start(br#"{"protocol":1,"deviceName":"Phone","allowApproval":false}"#)
                .unwrap(),
        )
        .await
        .unwrap();
        let frame = tokio::time::timeout(Duration::from_secs(2), receive.recv())
            .await
            .unwrap()
            .unwrap();
        assert_ne!(frame, APPROVAL_PENDING, "no prompt notice may be emitted");
        let reply: Value = serde_json::from_slice(&client.finish(&frame).unwrap()).unwrap();
        assert_eq!(reply["ok"], allowed, "{reply}");
        assert!(shared.pending.lock().unwrap().is_empty());
        assert!(shared.active.lock().unwrap().is_empty());
        if allowed {
            assert_eq!(reply["silentReconnect"], true);
            send.send(
                client
                    .encrypt(br#"{"id":"state","method":"host.state","params":{}}"#)
                    .unwrap(),
            )
            .await
            .unwrap();
            let frame = tokio::time::timeout(Duration::from_secs(2), receive.recv())
                .await
                .unwrap()
                .unwrap();
            let result: Value = serde_json::from_slice(&client.decrypt(&frame).unwrap()).unwrap();
            assert_eq!(result["ok"], true, "trusted reconnection still works");
        }
        task.abort();
    }
}
