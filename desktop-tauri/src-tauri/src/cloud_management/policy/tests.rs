use super::*;
use serde_json::json;
fn receipt() -> Receipt {
    Receipt {
        account: "hashed-account".into(),
        host: "mac-key".into(),
        device: "phone-key".into(),
        approved_at: "original-approval".into(),
        generation: "approval-1".into(),
    }
}
fn phone() -> serde_json::Value {
    json!({"enabled":true,"active":[],"devices":[{"id":"phone-key","createdAt":"original-approval"}]})
}
#[test]
fn approved_phone_can_use_cloud_without_a_local_socket() {
    assert!(same_phone(&receipt(), "mac-key", &phone()));
}
#[test]
fn off_remove_reapprove_host_rotation_and_missing_fingerprint_fail_closed() {
    let mut off = phone();
    off["enabled"] = json!(false);
    let mut removed = phone();
    removed["devices"] = json!([]);
    let mut replaced = phone();
    replaced["devices"][0]["createdAt"] = json!("replacement");
    let mut missing = phone();
    missing["devices"][0]
        .as_object_mut()
        .unwrap()
        .remove("createdAt");
    for status in [off, removed, replaced, missing] {
        assert!(!same_phone(&receipt(), "mac-key", &status));
    }
    assert!(!same_phone(&receipt(), "another-mac", &phone()));
}
#[test]
fn current_server_consent_and_registered_mac_are_both_required() {
    let mut overview = CloudOverview {
        computer: json!({"enabled":true,"connected":true,"consentVersion":2}),
        access: json!({}),
    };
    assert!(eligible(&overview));
    for key in ["enabled", "connected"] {
        let mut disabled = overview.computer.clone();
        disabled[key] = json!(false);
        assert!(!eligible(&CloudOverview {
            computer: disabled,
            access: json!({})
        }));
    }
    overview.computer["consentVersion"] = json!(0);
    assert!(!eligible(&overview));
    assert!(registered(
        &json!({"computers":[{"id":"mac-key"}]}),
        "mac-key"
    ));
    assert!(!registered(
        &json!({"computers":[{"id":"other-owner-host"}]}),
        "mac-key"
    ));
    assert!(!registered(&json!({}), "mac-key"));
}
