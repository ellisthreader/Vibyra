use super::{IdentityKeyStore, KeyStorage};
use crate::identity::Identity;
use std::{
    collections::HashMap,
    fs,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};

#[derive(Default)]
struct Store {
    values: Mutex<HashMap<String, String>>,
    fail_read: AtomicBool,
    fail_write: AtomicBool,
    discard_write: AtomicBool,
}
impl IdentityKeyStore for Store {
    fn read(&self, id: &str) -> Result<Option<String>, String> {
        if self.fail_read.load(Ordering::SeqCst) {
            return Err("Credential store locked".into());
        }
        Ok(self.values.lock().unwrap().get(id).cloned())
    }
    fn write(&self, id: &str, value: &str) -> Result<(), String> {
        if self.fail_write.load(Ordering::SeqCst) {
            return Err("Credential store write failed".into());
        }
        if !self.discard_write.load(Ordering::SeqCst) {
            self.values.lock().unwrap().insert(id.into(), value.into());
        }
        Ok(())
    }
}

#[test]
fn migrates_existing_key_and_trust_without_changing_identity() {
    let dir = tempfile::tempdir().unwrap();
    let mut old = Identity::load(dir.path(), Some("Office")).unwrap();
    let phone = vibyra_transport::generate_keypair().unwrap();
    let id = hex::encode(&phone[32..]);
    old.devices.insert(
        id.clone(),
        crate::identity::Device {
            id,
            name: "Phone".into(),
            created_at: "2026-09-29".into(),
            last_seen: None,
            last_from: None,
            last_route: None,
        },
    );
    old.save().unwrap();
    let store = Store::default();
    let secured = Identity::load_with_store(dir.path(), None, Some(&store)).unwrap();
    assert_eq!(old.id(), secured.id());
    assert_eq!(old.private_key, secured.private_key);
    assert_eq!(secured.devices.len(), 1);
    let file = fs::read_to_string(dir.path().join("identity.json")).unwrap();
    assert!(!file.contains(&old.private_key));
    assert!(!file.contains("private_key"));
    assert!(file.contains("credentialStore"));
    let loaded = Identity::load_with_store(dir.path(), Some("Studio"), Some(&store)).unwrap();
    assert_eq!(loaded.private_key, old.private_key);
    assert_eq!(loaded.name, "Studio");
    assert!(!fs::read_to_string(dir.path().join("identity.json"))
        .unwrap()
        .contains(&old.private_key));
    assert!(Identity::load(dir.path(), None).is_err());
}

#[test]
fn failed_migration_retains_original_file_and_never_regenerates() {
    for failure in ["read", "write", "readback"] {
        let dir = tempfile::tempdir().unwrap();
        let old = Identity::load(dir.path(), None).unwrap();
        let original = fs::read(dir.path().join("identity.json")).unwrap();
        let store = Store::default();
        match failure {
            "read" => store.fail_read.store(true, Ordering::SeqCst),
            "write" => store.fail_write.store(true, Ordering::SeqCst),
            _ => store.discard_write.store(true, Ordering::SeqCst),
        }
        assert!(Identity::load_with_store(dir.path(), None, Some(&store)).is_err());
        assert_eq!(
            fs::read(dir.path().join("identity.json")).unwrap(),
            original
        );
        assert_eq!(Identity::load(dir.path(), None).unwrap().id(), old.id());
    }
}

#[test]
fn missing_locked_or_mismatched_os_key_fails_closed() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::default();
    let saved = Identity::load_with_store(dir.path(), None, Some(&store)).unwrap();
    assert!(saved.key_storage == KeyStorage::CredentialStore);
    let original = fs::read(dir.path().join("identity.json")).unwrap();
    store.fail_read.store(true, Ordering::SeqCst);
    assert!(Identity::load_with_store(dir.path(), None, Some(&store)).is_err());
    store.fail_read.store(false, Ordering::SeqCst);
    store.values.lock().unwrap().clear();
    assert!(Identity::load_with_store(dir.path(), None, Some(&store)).is_err());
    store
        .values
        .lock()
        .unwrap()
        .insert(saved.id(), "00".repeat(32));
    assert!(Identity::load_with_store(dir.path(), None, Some(&store)).is_err());
    assert_eq!(
        fs::read(dir.path().join("identity.json")).unwrap(),
        original
    );
}

#[test]
fn mismatched_legacy_key_or_existing_store_is_not_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let old = Identity::load(dir.path(), None).unwrap();
    let store = Store::default();
    store
        .values
        .lock()
        .unwrap()
        .insert(old.id(), "00".repeat(32));
    assert!(Identity::load_with_store(dir.path(), None, Some(&store)).is_err());
    let path = dir.path().join("identity.json");
    let mut file: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    file["public_key"] = serde_json::json!("00".repeat(32));
    fs::write(path, serde_json::to_vec(&file).unwrap()).unwrap();
    assert!(Identity::load(dir.path(), None).is_err());
}

#[test]
fn new_identity_is_not_persisted_if_secure_store_write_fails() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::default();
    store.fail_write.store(true, Ordering::SeqCst);
    assert!(Identity::load_with_store(dir.path(), None, Some(&store)).is_err());
    assert!(!dir.path().join("identity.json").exists());
}

#[test]
fn account_reset_revokes_saved_consent_even_while_the_credential_store_is_locked() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::default();
    let mut identity = Identity::load_with_store(dir.path(), None, Some(&store)).unwrap();
    identity.devices.insert(
        "a".repeat(64),
        crate::identity::Device {
            id: "a".repeat(64),
            name: "Phone".into(),
            created_at: "test".into(),
            last_seen: None,
            last_from: None,
            last_route: None,
        },
    );
    identity.lan_mode = crate::lan_authorization::LanMode::Trusted;
    identity.save().unwrap();
    let public_key = identity.id();
    store.fail_read.store(true, Ordering::SeqCst);
    Identity::reset_lan_approval(dir.path()).unwrap();
    Identity::revoke_devices(dir.path(), None).unwrap();
    assert!(Identity::load_with_store(dir.path(), None, Some(&store)).is_err());
    store.fail_read.store(false, Ordering::SeqCst);
    let loaded = Identity::load_with_store(dir.path(), None, Some(&store)).unwrap();
    assert_eq!(loaded.id(), public_key);
    assert!(loaded.devices.is_empty());
    assert!(loaded.lan_mode == crate::lan_authorization::LanMode::Ask);
    let file = fs::read_to_string(dir.path().join("identity.json")).unwrap();
    assert!(!file.contains(&identity.private_key));
    let empty = tempfile::tempdir().unwrap();
    Identity::reset_lan_approval(empty.path()).unwrap();
    assert!(!empty.path().join("identity.json").exists());
}
