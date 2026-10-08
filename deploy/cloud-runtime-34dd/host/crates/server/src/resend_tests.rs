use crate::{auth::authenticate, test_support::nearby_state};
use futures_util::poll;
use serde_json::json;

#[tokio::test]
async fn newer_same_key_request_survives_old_denial_completion() {
    let (_dir, shared) = nearby_state();
    let id = "ce".repeat(32);
    let hello = json!({"protocol":1,"deviceName":"Resend diagnostic"}).to_string();
    let mut old = Box::pin(authenticate(&shared, &id, hello.as_bytes()));
    assert!(poll!(&mut old).is_pending());
    shared.answer(&id, false).unwrap();
    let mut newer = Box::pin(authenticate(&shared, &id, hello.as_bytes()));
    assert!(poll!(&mut newer).is_pending());
    assert_eq!(shared.pending.lock().unwrap().len(), 1);
    assert_eq!(old.await.unwrap_err(), "Pairing denied or expired");
    assert!(
        shared.pending.lock().unwrap().contains_key(&id),
        "old completion deleted newer request"
    );
    shared.answer(&id, true).unwrap();
    newer.await.unwrap();
}
#[tokio::test]
async fn newer_same_key_request_survives_old_future_drop() {
    let (_dir, shared) = nearby_state();
    let id = "cf".repeat(32);
    let hello = json!({"protocol":1,"deviceName":"Resend diagnostic"}).to_string();
    let mut old = Box::pin(authenticate(&shared, &id, hello.as_bytes()));
    assert!(poll!(&mut old).is_pending());
    shared.answer(&id, false).unwrap();
    let mut newer = Box::pin(authenticate(&shared, &id, hello.as_bytes()));
    assert!(poll!(&mut newer).is_pending());
    drop(old);
    assert!(
        shared.pending.lock().unwrap().contains_key(&id),
        "old drop deleted newer request"
    );
    shared.answer(&id, true).unwrap();
    newer.await.unwrap();
}
#[tokio::test]
async fn duplicate_requires_prior_request_cleanup_and_keeps_one_pending() {
    let (_dir, shared) = nearby_state();
    let id = "cd".repeat(32);
    let hello = json!({"protocol":1,"deviceName":"Resend diagnostic"}).to_string();
    let mut old = Box::pin(authenticate(&shared, &id, hello.as_bytes()));
    assert!(poll!(&mut old).is_pending());
    assert_eq!(
        authenticate(&shared, &id, hello.as_bytes())
            .await
            .unwrap_err(),
        "Pairing busy; create a new invitation"
    );
    assert_eq!(shared.pending.lock().unwrap().len(), 1);
    drop(old);
    assert!(shared.pending.lock().unwrap().is_empty());
    let mut newer = Box::pin(authenticate(&shared, &id, hello.as_bytes()));
    assert!(poll!(&mut newer).is_pending());
    assert_eq!(shared.pending.lock().unwrap().len(), 1);
    shared.answer(&id, true).unwrap();
    newer.await.unwrap();
}
