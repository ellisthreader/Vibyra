use super::*;
use crate::{
    backend::Backend,
    remote_test_support::{claims, signed},
};
use serde_json::{json, Value};
use std::sync::mpsc;

struct Empty;
impl Backend for Empty {
    fn handle(&self, _: &str, _: &str, _: Value) -> Result<Value, String> {
        Ok(json!({}))
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        mpsc::channel().1
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "Test"
    }
}

#[test]
fn queued_preview_cannot_outlive_its_connection_or_revoked_device_even_if_save_fails() {
    let directory = tempfile::tempdir().unwrap();
    let identity = crate::identity::Identity::load(&directory.path().join("state"), None).unwrap();
    let host_id = identity.id();
    let shared = Arc::new(Shared {
        policy_pending: std::sync::atomic::AtomicBool::new(identity.restrictions.is_some()),
        policy_failing_since: std::sync::atomic::AtomicU64::new(0),
        identity: std::sync::Mutex::new(identity),
        engine: Arc::new(Empty),
        writes: std::sync::Mutex::new(()),
        invitation: std::sync::Mutex::new(None),
        pending: std::sync::Mutex::default(),
        active: std::sync::Mutex::default(),
        used_remote_grants: std::sync::Mutex::default(),
        remote_authorizations: std::sync::Mutex::default(),
        lan_generation: std::sync::atomic::AtomicU64::new(1),
        policy_epoch: std::sync::atomic::AtomicU64::new(1),
        pairing_url: String::new(),
        relay: false,
        nearby: true,
    });
    let device = "a".repeat(64);
    shared.trust(&device, "Phone").unwrap();
    let slot = Arc::new(Notify::new());
    shared
        .active
        .lock()
        .unwrap()
        .insert(device.clone(), slot.clone());
    let body = claims(&host_id, &device, &["preview:access", "screen:view"]);
    let (key, token) = signed(&body);
    let access = ScopedPreview {
        grant: Authorization::new(
            &key,
            &token,
            &host_id,
            &crate::remote_test_support::context(),
        )
        .unwrap(),
        owner: Arc::downgrade(&shared),
        device: device.clone(),
        slot: Arc::downgrade(&slot),
    };
    assert!(access.permits("screen:view"));
    assert!(!access.permits("keyboard:control"));
    shared
        .active
        .lock()
        .unwrap()
        .insert(device.clone(), Arc::new(Notify::new()));
    assert!(
        !access.permits("screen:view"),
        "old socket cannot use replacement authority"
    );
    shared.active.lock().unwrap().insert(device.clone(), slot);
    assert!(access.permits("screen:view"));
    // Make the atomic identity-file replacement fail after removing trust.
    let file = directory.path().join("state/identity.json");
    std::fs::remove_file(&file).unwrap();
    std::fs::create_dir(&file).unwrap();
    assert!(shared.revoke(&device).is_err());
    assert!(!shared.trusted(&device));
    assert!(!access.permits("screen:view"));
}
