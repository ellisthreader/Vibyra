use crate::{embedded_tests::ViewBackend, *};
use serde_json::json;
use std::sync::Arc;
fn host(path: &std::path::Path) -> EmbeddedHost {
    EmbeddedHost::start(
        path.into(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(ViewBackend::default()),
        "Policy test",
    )
    .unwrap()
}
fn bind(host: &EmbeddedHost) -> RestrictionCheckpoint {
    host.registration_proof()
        .bind_restriction_context(
            "account",
            &AuthorizationContext {
                user_id: "1".into(),
                generation: 7,
            },
        )
        .unwrap();
    host.restriction_checkpoint("account").unwrap().unwrap()
}
fn page(
    host: &EmbeddedHost,
    revision: u64,
    reset: u64,
    revoked: serde_json::Value,
    approved: serde_json::Value,
) -> RestrictionPage {
    serde_json::from_value(json!({"hostId":host.id(),"userId":"1","generation":7,
        "revision":revision,"disableRevision":0,"resetRevision":reset,
        "revokedDevices":revoked,"approvedDevices":approved,"nextRevision":revision,"hasMore":false})).unwrap()
}
fn apply(
    host: &EmbeddedHost,
    checkpoint: &RestrictionCheckpoint,
    page: RestrictionPage,
) -> Result<Vec<String>, String> {
    let mut batch = RestrictionBatch::new(checkpoint.receipt.clone());
    batch.accept(&host.id(), page)?;
    checkpoint.finish(batch)
}
#[test]
fn managed_restart_and_network_failure_require_local_consent_without_deleting_pairings() {
    let dir = tempfile::tempdir().unwrap();
    let host = host(dir.path());
    let key = "b".repeat(64);
    host.approve_remote_device(&key, "Phone").unwrap();
    host.set_lan_approval_mode("trusted").unwrap();
    let checkpoint = bind(&host);
    assert_eq!(host.lan_approval_mode(), "ask");
    apply(&host, &checkpoint, page(&host, 0, 0, json!([]), json!([]))).unwrap();
    assert_eq!(host.lan_approval_mode(), "trusted");
    drop(host);
    let host = self::host(dir.path());
    assert_eq!(host.lan_approval_mode(), "ask");
    let checkpoint = bind(&host);
    checkpoint.suspend().unwrap();
    assert_eq!(host.status()["devices"].as_array().unwrap().len(), 1);
    host.approve_remote_device(&key, "Phone").unwrap();
    assert!(checkpoint.check(&host).is_err());
    assert_eq!(host.lan_approval_mode(), "ask");
}
#[test]
fn reset_preserves_only_already_local_keys_approved_after_reset() {
    let dir = tempfile::tempdir().unwrap();
    let host = host(dir.path());
    for key in ['a', 'b'] {
        host.approve_remote_device(&key.to_string().repeat(64), "Phone")
            .unwrap();
    }
    let checkpoint = bind(&host);
    let removed = apply(
        &host,
        &checkpoint,
        page(
            &host,
            3,
            2,
            json!([]),
            json!([
        {"publicKey":"b".repeat(64),"revision":3},{"publicKey":"c".repeat(64),"revision":3}]),
        ),
    )
    .unwrap();
    assert_eq!(removed, vec!["a".repeat(64)]);
    let devices = host.status()["devices"].as_array().unwrap().clone();
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0]["id"], "b".repeat(64));
    drop(host);
    let host = self::host(dir.path());
    assert_eq!(bind(&host).receipt.revision, 3);
    assert_eq!(host.status()["devices"].as_array().unwrap().len(), 1);
}
#[test]
fn stale_local_decision_account_generation_and_host_restart_reject_old_fetches() {
    let dir = tempfile::tempdir().unwrap();
    let host = host(dir.path());
    let old = bind(&host);
    host.set_lan_approval_mode("ask").unwrap();
    assert!(old.check(&host).is_err());
    let old = bind(&host);
    host.registration_proof()
        .bind_restriction_context(
            "account-b",
            &AuthorizationContext {
                user_id: "2".into(),
                generation: 8,
            },
        )
        .unwrap();
    assert!(old.check(&host).is_err());
    assert!(host.restriction_checkpoint("account").unwrap().is_none());
    let old = host.restriction_checkpoint("account-b").unwrap().unwrap();
    drop(host);
    let host = self::host(dir.path());
    assert!(old.check(&host).is_err());
}
#[test]
fn explicit_disable_is_immediate_and_durable_before_all_pages_arrive() {
    let dir = tempfile::tempdir().unwrap();
    let host = host(dir.path());
    let checkpoint = bind(&host);
    let mut first = page(
        &host,
        5,
        0,
        json!([{"publicKey":"b".repeat(64),"revision":1}]),
        json!([]),
    );
    first.disable_revision = 5;
    first.next_revision = 1;
    first.has_more = true;
    let mut batch = RestrictionBatch::new(checkpoint.receipt.clone());
    assert!(batch.accept(&host.id(), first).unwrap());
    checkpoint.disable().unwrap();
    assert_eq!(host.lan_approval_mode(), "disabled");
    assert!(checkpoint.finish(batch).is_err());
    assert_eq!(bind(&host).receipt.revision, 0);
    drop(host);
    let host = self::host(dir.path());
    assert_eq!(host.lan_approval_mode(), "disabled");
}
#[test]
fn failed_persistence_keeps_restrictions_in_memory_without_acknowledging_them() {
    let dir = tempfile::tempdir().unwrap();
    let host = host(dir.path());
    let key = "b".repeat(64);
    host.approve_remote_device(&key, "Phone").unwrap();
    let checkpoint = bind(&host);
    std::fs::remove_file(dir.path().join("identity.json")).unwrap();
    std::fs::create_dir(dir.path().join("identity.json")).unwrap();
    assert!(apply(&host, &checkpoint, page(&host, 2, 2, json!([]), json!([]))).is_err());
    assert!(host.status()["devices"].as_array().unwrap().is_empty());
    assert_eq!(bind(&host).receipt.revision, 0);
    assert_eq!(host.status()["securitySyncPending"], true);
}
#[test]
fn tombstone_survives_same_owner_registration_and_requires_new_local_consent() {
    let dir = tempfile::tempdir().unwrap();
    let host = host(dir.path());
    let key = "b".repeat(64);
    host.approve_remote_device(&key, "Phone").unwrap();
    let checkpoint = bind(&host);
    bind(&host);
    apply(
        &host,
        &checkpoint,
        page(
            &host,
            4,
            0,
            json!([{"publicKey":key,"revision":4}]),
            json!([]),
        ),
    )
    .unwrap();
    assert!(host.status()["devices"].as_array().unwrap().is_empty());
    assert_eq!(bind(&host).receipt.revision, 4);
}
