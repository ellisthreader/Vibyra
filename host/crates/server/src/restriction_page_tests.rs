use crate::remote_restrictions::*;
use serde_json::{json, Value};
fn batch() -> RestrictionBatch {
    RestrictionBatch::new(RestrictionReceipt {
        account_scope: "account".into(),
        user_id: "1".into(),
        generation: 7,
        revision: 0,
    })
}
fn value() -> Value {
    json!({"hostId":"a".repeat(64),"userId":"1","generation":7,"revision":2,
        "disableRevision":0,"resetRevision":0,"revokedDevices":[{"publicKey":"b".repeat(64),"revision":1}],
        "approvedDevices":[],"nextRevision":1,"hasMore":true})
}
#[test]
fn pages_reject_wrong_scope_reordered_tombstones_and_changed_snapshot() {
    for (field, replacement) in [
        ("hostId", json!("c".repeat(64))),
        ("userId", json!("2")),
        ("generation", json!(8)),
        ("nextRevision", json!(0)),
        ("disableRevision", json!(3)),
    ] {
        let mut page = value();
        page[field] = replacement;
        assert!(batch()
            .accept(&"a".repeat(64), serde_json::from_value(page).unwrap())
            .is_err());
    }
    let mut batch = batch();
    batch
        .accept(&"a".repeat(64), serde_json::from_value(value()).unwrap())
        .unwrap();
    assert!(!batch.complete());
    assert!(batch
        .accept(&"a".repeat(64), serde_json::from_value(value()).unwrap())
        .is_err());
    let mut changed = value();
    changed["revision"] = json!(3);
    changed["nextRevision"] = json!(3);
    changed["hasMore"] = json!(false);
    changed["revokedDevices"] = json!([]);
    assert!(batch
        .accept(&"a".repeat(64), serde_json::from_value(changed).unwrap())
        .is_err());
}
#[test]
fn actual_php_snapshot_serialization_and_revision_conflict_are_compatible() {
    let fixture: Value =
        serde_json::from_str(include_str!("../../../fixtures/remote-controls.json")).unwrap();
    let mut batch = batch();
    batch
        .accept(
            &"a".repeat(64),
            serde_json::from_value(fixture["first"]["control"].clone()).unwrap(),
        )
        .unwrap();
    assert_eq!(batch.cursor(), 100);
    assert_eq!(batch.revision(), Some(101));
    assert!(batch
        .accept(
            &"a".repeat(64),
            serde_json::from_value(fixture["second"]["control"].clone()).unwrap()
        )
        .is_err());
    assert_eq!(batch.receipt.revision, 0);
    assert!(!batch.complete());
}
