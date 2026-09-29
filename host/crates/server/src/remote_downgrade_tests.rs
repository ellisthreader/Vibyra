use super::*;
#[tokio::test]
async fn missing_verification_key_or_account_context_never_opens_a_cloud_peer() {
    let fixture = Fixture::new(&["screen:view"], 90).await;
    let (key, token) = signed(&fixture.claim);
    for (key, context) in [(None, None), (Some(key), None)] {
        let (sender, _) = queue::channel(4);
        let mut peers = Peers::new(fixture.shared.clone(), sender, key, context);
        assert!(peers
            .handle(json!({"type":"client.open","clientId":"unsigned", "authorization":token}))
            .is_err());
        assert_eq!(peers.len(), 0);
        assert!(peers
            .enable_loopback_diagnostics("wss://remote.example.com")
            .is_err());
        assert!(peers
            .enable_loopback_diagnostics("ws://192.168.1.10:9999")
            .is_err());
    }
}

#[tokio::test]
async fn native_session_disconnect_revokes_exact_cloud_access_without_a_backend_round_trip() {
    let mut fixture = Fixture::new(&["screen:view"], 90).await;
    assert_eq!(fixture.handshake("phone").await["ok"], true);
    let _ = fixture.request("phone", "host.state").await;
    let session = fixture.claim["sessionId"].as_str().unwrap().to_owned();
    fixture.shared.revoke_remote_session(&session).unwrap();
    assert_eq!(fixture.next().await["type"], "client.close");
    assert!(fixture
        .shared
        .trusted(&hex::encode(&fixture.phone_key[32..])));
    assert!(fixture
        .shared
        .used_remote_grants
        .lock()
        .unwrap()
        .contains_key(&session));
}

#[test]
fn per_session_revoke_does_not_invalidate_another_signed_session() {
    let (_, shared) = state_with_backend(Arc::new(Probe::default()));
    let host = shared.identity.lock().unwrap().id();
    let first = claims(&host, &"a".repeat(64), &["screen:view"]);
    let mut second = first.clone();
    second["sessionId"] = json!("other-session");
    second["jti"] = json!("other-session");
    let make = |claims: &Value| {
        let (key, token) = signed(claims);
        crate::remote_authorization::Authorization::new(
            &key,
            &token,
            &host,
            &crate::remote_test_support::context(),
        )
        .unwrap()
    };
    let first_grant = make(&first);
    let second_grant = make(&second);
    shared.register_authorization(&first_grant).unwrap();
    shared.register_authorization(&second_grant).unwrap();
    shared
        .revoke_remote_session(first["sessionId"].as_str().unwrap())
        .unwrap();
    assert!(first_grant.valid().is_err());
    assert!(first_grant.renew(&signed(&first).1).is_err());
    assert!(second_grant.valid().is_ok());
}

#[tokio::test]
async fn local_disconnect_also_blocks_delayed_confirmation() {
    let mut fixture = Fixture::new(&["screen:view"], 90).await;
    assert_eq!(fixture.handshake("pending").await["ok"], true);
    let session = fixture.claim["sessionId"].as_str().unwrap().to_owned();
    fixture.shared.revoke_remote_session(&session).unwrap();
    let frame = fixture
        .client
        .encrypt(br#"{"id":"late","method":"host.state"}"#)
        .unwrap();
    fixture.send("pending", frame);
    assert_eq!(fixture.next().await["type"], "client.close");
    assert!(fixture.shared.active.lock().unwrap().is_empty());
}
