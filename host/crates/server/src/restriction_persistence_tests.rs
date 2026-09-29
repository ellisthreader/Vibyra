use crate::{embedded_tests::ViewBackend, *};
use serde_json::json;
use std::sync::Arc;
#[test]
fn failed_companion_store_still_persists_host_revocation_without_acknowledgement() {
    let dir = tempfile::tempdir().unwrap();
    let host = EmbeddedHost::start(
        dir.path().into(),
        "127.0.0.1:0".parse().unwrap(),
        Arc::new(ViewBackend::default()),
        "Test",
    )
    .unwrap();
    host.approve_remote_device(&"b".repeat(64), "Phone")
        .unwrap();
    host.registration_proof()
        .bind_restriction_context(
            "account",
            &AuthorizationContext {
                user_id: "1".into(),
                generation: 7,
            },
        )
        .unwrap();
    let checkpoint = host.restriction_checkpoint("account").unwrap().unwrap();
    let mut batch = RestrictionBatch::new(checkpoint.receipt.clone());
    batch
        .accept(
            &host.id(),
            serde_json::from_value(json!({"hostId":host.id(),"userId":"1","generation":7,
        "revision":1,"disableRevision":0,"resetRevision":1,"revokedDevices":[],"approvedDevices":[],
        "nextRevision":1,"hasMore":false}))
            .unwrap(),
        )
        .unwrap();
    checkpoint.restrict_without_acknowledgement(batch).unwrap();
    assert!(host.status()["devices"].as_array().unwrap().is_empty());
    assert_eq!(
        host.restriction_checkpoint("account")
            .unwrap()
            .unwrap()
            .receipt
            .revision,
        0
    );
    assert_eq!(host.status()["securitySyncPending"], true);
    let saved: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.path().join("identity.json")).unwrap()).unwrap();
    assert_eq!(saved["restrictions"]["revision"], 0);
    assert_eq!(saved["devices"], json!({}));
}
