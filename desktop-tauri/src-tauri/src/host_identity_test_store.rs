//! Unit tests never open or populate the developer's real credential store.
use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};
static KEYS: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(Mutex::default);

pub(super) fn read(key: &str) -> Result<Option<String>, String> {
    Ok(KEYS
        .lock()
        .map_err(|_| "Test key store unavailable")?
        .get(key)
        .cloned())
}
pub(super) fn write(key: &str, value: &str) -> Result<(), String> {
    KEYS.lock()
        .map_err(|_| "Test key store unavailable")?
        .insert(key.into(), value.into());
    Ok(())
}

#[test]
fn native_host_identity_uses_credential_store_and_keeps_public_id_stable() {
    let directory = tempfile::tempdir().unwrap();
    let store = super::SecretStore;
    let id = vibyra_host::host_identity_id_with_key_store(directory.path(), &store).unwrap();
    let file = std::fs::read_to_string(directory.path().join("identity.json")).unwrap();
    assert!(file.contains("credentialStore"));
    assert!(!file.contains("private_key"));
    assert_eq!(
        vibyra_host::host_identity_id_with_key_store(directory.path(), &store).unwrap(),
        id
    );
}
