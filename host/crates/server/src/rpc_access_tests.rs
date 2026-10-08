use super::*;
use crate::{
    backend::Backend,
    remote_authorization::Authorization,
    remote_test_support::{claims, signed},
};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc, Mutex,
};

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
fn delayed_rpc_effect_loses_authority_on_lease_revocation_takeover_or_local_policy_change() {
    let directory = tempfile::tempdir().unwrap();
    let identity = crate::identity::Identity::load(&directory.path().join("state"), None).unwrap();
    let host_id = identity.id();
    let shared = Arc::new(Shared {
        policy_pending: AtomicBool::new(identity.restrictions.is_some()),
        policy_failing_since: std::sync::atomic::AtomicU64::new(0),
        identity: Mutex::new(identity),
        engine: Arc::new(Empty),
        writes: Mutex::new(()),
        invitation: Mutex::new(None),
        pending: Mutex::default(),
        active: Mutex::default(),
        used_remote_grants: Mutex::default(),
        remote_authorizations: Mutex::default(),
        lan_generation: AtomicU64::new(1),
        lan_visits: std::sync::Mutex::new(Default::default()),
        policy_epoch: AtomicU64::new(1),
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
    let (key, token) = signed(&claims(&host_id, &device, &["terminal:access"]));
    let grant = Authorization::new(
        &key,
        &token,
        &host_id,
        &crate::remote_test_support::context(),
    )
    .unwrap();
    let access = Arc::new(ScopedRpc {
        grant: Some(grant.clone()),
        owner: Arc::downgrade(&shared),
        device: device.clone(),
        slot: Arc::downgrade(&slot),
        lan_generation: None,
        alive: Arc::new(AtomicBool::new(true)),
    });
    let captured = with_rpc_access(access, || current_rpc_access().unwrap());
    assert!(current_rpc_access().is_none());
    assert!(captured.permits("terminal:access"));
    assert!(!captured.permits("keyboard:control"));
    shared
        .active
        .lock()
        .unwrap()
        .insert(device.clone(), Arc::new(Notify::new()));
    assert!(!captured.permits("terminal:access"));
    shared
        .active
        .lock()
        .unwrap()
        .insert(device.clone(), slot.clone());
    assert!(captured.permits("terminal:access"));
    grant.revoke();
    assert!(!captured.permits("terminal:access"));
    let lifetime = RpcLifetime::new();
    let nearby = ScopedRpc {
        grant: None,
        owner: Arc::downgrade(&shared),
        device: device.clone(),
        slot: Arc::downgrade(&slot),
        lan_generation: Some(1),
        alive: lifetime.0.clone(),
    };
    assert!(nearby.permits("terminal:access"));
    lifetime.0.store(false, Ordering::SeqCst);
    assert!(
        !nearby.permits("terminal:access"),
        "disconnect cannot wait for pending renderer reply"
    );
    lifetime.0.store(true, Ordering::SeqCst);
    shared.lan_generation.store(2, Ordering::SeqCst);
    assert!(!nearby.permits("terminal:access"));
    shared.lan_generation.store(1, Ordering::SeqCst);
    shared.revoke(&device).unwrap();
    assert!(!nearby.permits("terminal:access"));
}
