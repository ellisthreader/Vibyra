use crate::{
    auth::authenticate,
    identity::Identity,
    test_support::{approve_when_pending, state, token},
};
use serde_json::json;

#[tokio::test]
async fn pairing_requires_invitation_and_local_approval_then_persists() {
    let (dir, shared) = state();
    let id = "11".repeat(32);
    let invalid = json!({"protocol":1,"deviceName":"Phone","invite":"invalid"}).to_string();
    assert!(authenticate(&shared, &id, invalid.as_bytes())
        .await
        .is_err());
    let invite = token(&shared.invite(None).unwrap());
    let hello = json!({"protocol":1,"deviceName":"Phone","invite":invite}).to_string();
    let approved = tokio::spawn(approve_when_pending(shared.clone(), id.clone()));
    authenticate(&shared, &id, hello.as_bytes()).await.unwrap();
    approved.await.unwrap();
    assert!(shared.trusted(&id));
    let loaded = Identity::load(&dir.path().join("state"), None).unwrap();
    assert!(loaded.devices.contains_key(&id));
    assert!(authenticate(&shared, &"22".repeat(32), hello.as_bytes())
        .await
        .is_err());
    let reconnect = json!({"protocol":1,"deviceName":"Phone"}).to_string();
    authenticate(&shared, &id, reconnect.as_bytes())
        .await
        .unwrap();
    shared.revoke(&id).unwrap();
    assert!(authenticate(&shared, &id, reconnect.as_bytes())
        .await
        .is_err());
}

#[tokio::test]
async fn local_denial_consumes_invite_and_never_trusts_phone() {
    let (_dir, shared) = state();
    let id = "33".repeat(32);
    let invite = token(&shared.invite(None).unwrap());
    let hello = json!({"protocol":1,"deviceName":"Phone","invite":invite}).to_string();
    let state = shared.clone();
    let key = id.clone();
    let deny = tokio::spawn(async move {
        for _ in 0..200 {
            if state.pending.lock().unwrap().contains_key(&key) {
                state.answer(&key, false).unwrap();
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
        panic!("No pending local approval");
    });
    assert!(authenticate(&shared, &id, hello.as_bytes()).await.is_err());
    deny.await.unwrap();
    assert!(!shared.trusted(&id));
    assert!(!shared.consume_invite(&invite));
}

#[test]
fn new_invitation_invalidates_previous_and_identity_is_private() {
    let (dir, shared) = state();
    let old = token(&shared.invite(None).unwrap());
    let new = token(&shared.invite(None).unwrap());
    assert!(!shared.consume_invite(&old));
    assert!(shared.consume_invite(&new));
    assert!(!shared.consume_invite(&new));
    assert!(shared.invite(Some("http://example.com")).is_err());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(dir.path().join("state/identity.json"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }
}
