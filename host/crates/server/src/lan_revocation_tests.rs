use super::*;
#[tokio::test]
async fn revoked_device_cannot_finish_old_approval_or_delayed_confirmation() {
    let (_dir, shared) = nearby_state();
    let key = generate_keypair().unwrap();
    let mut phone = Phone::start(shared.clone(), &key, Origin::Nearby("127.0.0.1".into())).await;
    pending(&shared, &phone.id).await;
    let generation = shared
        .lan_generation
        .load(std::sync::atomic::Ordering::SeqCst);
    shared.answer(&phone.id, true).unwrap();
    assert_eq!(phone.hello().await["ok"], true);
    shared.revoke(&phone.id).unwrap();
    assert!(shared
        .trust_with_generation(&phone.id, "Stale approval", Some(generation))
        .is_err());
    phone
        .send
        .send(
            phone
                .client
                .encrypt(br#"{"id":"late","method":"host.state"}"#)
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(tokio::time::timeout(Duration::from_secs(2), phone.task)
        .await
        .unwrap()
        .unwrap()
        .is_err());
    assert!(!shared.trusted(&phone.id));
    assert!(shared.active.lock().unwrap().is_empty());
}

#[tokio::test]
async fn cloud_approval_completion_is_also_fenced_by_local_revocation() {
    let (_dir, shared) = nearby_state();
    let key = generate_keypair().unwrap();
    let mut phone = Phone::start(shared.clone(), &key, Origin::Cloud).await;
    pending(&shared, &phone.id).await;
    shared.answer(&phone.id, true).unwrap();
    // Do not yield: the old approval has been delivered but not consumed.
    assert!(shared.revoke(&phone.id).is_err());
    assert_eq!(phone.hello().await["ok"], false);
    assert!(phone.task.await.unwrap().is_err());
    assert!(!shared.trusted(&phone.id));
}
