use super::*;
use crate::{
    remote_permissions as policy,
    remote_test_support::{claims, signed},
};
use serde_json::json;

fn authorization(key: &str, token: &str, host: &str) -> Result<Arc<Authorization>, String> {
    Authorization::new(key, token, host, &crate::remote_test_support::context())
}

fn issued(permissions: &[&str]) -> Arc<Authorization> {
    let (key, token) = signed(&claims(&"a".repeat(64), &"b".repeat(64), permissions));
    authorization(&key, &token, &"a".repeat(64)).unwrap()
}

#[test]
fn the_php_sodium_signer_and_rust_verifier_share_the_exact_wire_format() {
    // Produced by the real RemoteSessionTokens.php with synthetic seed [42;32].
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("remote_authorization_fixture.json")).unwrap();
    let key = STANDARD
        .decode(fixture["publicKey"].as_str().unwrap())
        .unwrap();
    let claims = verify(&key, fixture["token"].as_str().unwrap(), 1_900_000_000).unwrap();
    assert_eq!(claims.permissions, ["terminal:access", "preview:access"]);
    assert_eq!(claims.host_id, "a".repeat(64));
}
#[test]
fn signed_leases_bind_the_host_phone_and_intended_session() {
    let grant = issued(&["screen:view"]);
    let hello =
        json!({"remoteSessionId":grant.claims.session_id,"remoteAuthorizationId":grant.claims.jti});
    assert!(grant
        .bind(&"b".repeat(64), hello.to_string().as_bytes())
        .is_ok());
    assert!(grant
        .bind(&"c".repeat(64), hello.to_string().as_bytes())
        .is_err());
    assert!(grant.bind(&"b".repeat(64), b"{}").is_err());
    let (key, token) = signed(&claims(&"a".repeat(64), &"b".repeat(64), &["screen:view"]));
    assert!(authorization(&key, &token, &"c".repeat(64)).is_err());
    assert!(authorization(&key, &format!("{token}.extra"), &"a".repeat(64)).is_err());
    let changed = token.replacen("ra1.", "ra2.", 1);
    assert!(authorization(&key, &changed, &"a".repeat(64)).is_err());
    let mut modified = token.into_bytes();
    modified[20] = if modified[20] == b'a' { b'b' } else { b'a' };
    assert!(authorization(
        &key,
        std::str::from_utf8(&modified).unwrap(),
        &"a".repeat(64)
    )
    .is_err());
}

#[test]
fn unused_grant_cannot_cross_an_account_switch_or_host_reregistration() {
    let (key, token) = signed(&claims(&"a".repeat(64), &"b".repeat(64), &["screen:view"]));
    let mut context = crate::remote_test_support::context();
    context.user_id = "456".into();
    assert!(Authorization::new(&key, &token, &"a".repeat(64), &context).is_err());
    context.user_id = "123".into();
    context.generation += 1;
    assert!(Authorization::new(&key, &token, &"a".repeat(64), &context).is_err());
    assert!(authorization(&key, &token, &"a".repeat(64)).is_ok());
}
#[test]
fn expired_future_oversized_unknown_and_duplicate_claims_fail_closed() {
    let base = claims(&"a".repeat(64), &"b".repeat(64), &["screen:view"]);
    for (field, value) in [
        ("exp", json!(now() - 1)),
        ("exp", json!(now() + 121)),
        ("iat", json!(now() + 31)),
        ("sessionExpiresAt", json!(now() + 12 * 3600 + 1)),
        ("permissions", json!(["admin:all"])),
        ("permissions", json!(["screen:view", "screen:view"])),
        ("unknown", json!(true)),
        ("hostId", json!("not-a-key")),
        ("sub", json!("")),
        ("generation", json!(0)),
    ] {
        let mut claim = base.clone();
        claim[field] = value;
        let (key, token) = signed(&claim);
        assert!(
            authorization(&key, &token, &"a".repeat(64)).is_err(),
            "{field}"
        );
    }
}
#[test]
fn renewal_cannot_expand_authority_or_revive_an_expired_lease() {
    let grant = issued(&["terminal:access"]);
    let mut update = serde_json::to_value(&grant.claims).unwrap();
    update["exp"] = json!(grant.claims.exp + 10);
    assert!(grant.renew(&signed(&update).1).is_ok());
    for field in [
        "sessionId",
        "deviceId",
        "hostId",
        "jti",
        "sub",
        "generation",
    ] {
        let mut wrong = update.clone();
        wrong[field] = json!("c".repeat(64));
        assert!(grant.renew(&signed(&wrong).1).is_err());
    }
    let mut wider = update.clone();
    wider["permissions"] = json!(["terminal:access", "files:read"]);
    assert!(grant.renew(&signed(&wider).1).is_err());
    let mut backward = update.clone();
    backward["exp"] = json!(grant.claims.exp);
    assert!(grant.renew(&signed(&backward).1).is_err());
    grant.lease.lock().unwrap().1 = now() - 1;
    assert!(grant.valid().is_err());
    assert!(grant.renew(&signed(&update).1).is_err());
}
#[test]
fn screen_and_keyboard_grants_do_not_gain_terminal_files_or_preview() {
    let view = Some(issued(&["screen:view"]));
    for method in [
        "session.input",
        "session.snapshot",
        "turn.submit",
        "project.read",
        "preview.open",
        "focusedText.edit",
        "future.execute",
    ] {
        assert!(
            policy::request(&view, method, &json!({})).is_err(),
            "{method}"
        );
    }
    assert!(policy::request(&view, "host.state", &json!({})).is_ok());
    assert!(!policy::event(&view, &json!({"event":"terminal.output"})));
    assert!(!policy::event(
        &view,
        &json!({"event":"conversation.updated"})
    ));
    assert!(!policy::event(&view, &json!({"event":"unknown"})));
    assert!(policy::preview(&view).is_err());
    let keyboard = Some(issued(&["keyboard:control"]));
    assert!(policy::request(&keyboard, "focusedText.edit", &json!({})).is_ok());
    assert!(policy::request(&keyboard, "project.read", &json!({})).is_err());
    let terminal = Some(issued(&["terminal:access"]));
    assert!(policy::request(&terminal, "session.input", &json!({})).is_ok());
    assert!(policy::request(&terminal, "conversation.attachment", &json!({})).is_err());
    assert!(policy::request(&terminal, "vibes.tool", &json!({"operation":"write_file"})).is_err());
    let preview = Some(issued(&["preview:access"]));
    assert!(policy::preview(&preview).is_ok());
    assert!(policy::request(&preview, "preview.run", &json!({})).is_err());
    assert!(policy::request(&preview, "preview.window.share", &json!({})).is_err());
    assert!(policy::request(&preview, "preview.list", &json!({"windowHandoffV1":true})).is_err());
    let window = Some(issued(&["preview:access", "screen:view"]));
    assert!(policy::request(&window, "preview.list", &json!({"windowV1":true})).is_ok());
    let state = json!({"sessions":[{"output":"secret"}],"projects":[{"path":"secret"}],"devices":[{}],
        "railway":{"account":"secret"},"capabilities":{"canInput":true,"focusedTextV1":true},"sessionCount":1});
    let state = policy::response(&view, "host.state", state).unwrap();
    assert_eq!(state["sessions"], json!([]));
    assert_eq!(state["projects"], json!([]));
    assert_eq!(state["railway"], json!(null));
    assert_eq!(state["devices"], json!([]));
    assert_eq!(state["capabilities"]["canInput"], false);
}

#[test]
fn configured_twelve_hour_hard_deadline_is_accepted_without_extending_the_lease() {
    let mut claim = claims(&"a".repeat(64), &"b".repeat(64), &["screen:view"]);
    claim["sessionExpiresAt"] = json!(claim["iat"].as_u64().unwrap() + 12 * 3600);
    let (key, token) = signed(&claim);
    assert!(authorization(&key, &token, &"a".repeat(64)).is_ok());
}
