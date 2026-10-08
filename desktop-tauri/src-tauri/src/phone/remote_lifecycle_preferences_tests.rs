//! Local remote preferences and trust remain restrictive when transport stops.
use super::*;

#[test]
fn disabling_cloud_stays_off_when_local_preferences_cannot_be_saved() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("not-a-directory");
    std::fs::write(&path, "block persistence").unwrap();
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let mut phone = PhoneConnection::new(path, manager.clone()).into_inner();
    phone.remote_enabled = true;
    assert!(phone.set_remote(false).is_err());
    assert!(!phone.remote_enabled);
    phone.account_signed_in();
    assert!(phone.remote.is_none());
    manager.shutdown();
}

#[test]
fn revoke_all_clears_local_trust_even_when_sharing_is_stopped() {
    let dir = tempfile::tempdir().unwrap();
    let host = EmbeddedHost::start(
        dir.path().to_owned(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(View::default()),
        "Test",
    )
    .unwrap();
    let host_id = host.id();
    let key = "a".repeat(64);
    host.approve_remote_device(&key, "Saved phone").unwrap();
    drop(host);
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let phone = PhoneConnection::new(dir.path().to_owned(), manager.clone()).into_inner();
    assert!(phone.owns_remote_host(&host_id).unwrap());
    assert!(!phone.owns_remote_host(&"b".repeat(64)).unwrap());
    phone.revoke_remote_devices(None).unwrap();
    let saved: Value =
        serde_json::from_slice(&std::fs::read(dir.path().join("identity.json")).unwrap()).unwrap();
    assert!(saved["devices"].as_object().unwrap().is_empty());
    manager.shutdown();
}
