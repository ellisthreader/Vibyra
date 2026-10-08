use super::*;

#[test]
fn host_proof_requires_the_exact_device_key_code_permissions_and_decision_shown() {
    let scope = Scope {
        account_scope: "owner".into(),
        host_id: "a".repeat(64),
    };
    let decision = DeviceDecision {
        id: "12345678-1234-1234-1234-123456789abc".into(),
        public_key: "b".repeat(64),
        pairing_code: "123456".into(),
        permissions: vec!["screen:view".into(), "preview:access".into()],
        approve: true,
    };
    let challenge = json!({"hostId":scope.host_id,"deviceId":decision.id,"publicKey":decision.public_key,
        "purpose":"approve","pairingCode":"123456","permissions":["preview:access","screen:view"]});
    assert!(verify_device_challenge(&challenge, &scope, &decision, "approve").is_ok());
    for field in ["hostId", "deviceId", "publicKey", "purpose", "pairingCode"] {
        let mut stale = challenge.clone();
        stale[field] = json!("changed");
        assert!(
            verify_device_challenge(&stale, &scope, &decision, "approve").is_err(),
            "{field}"
        );
        stale.as_object_mut().unwrap().remove(field);
        assert!(verify_device_challenge(&stale, &scope, &decision, "approve").is_err());
    }
    for permissions in [
        json!([]),
        json!(["preview:access", "screen:view", "keyboard:control"]),
        json!(["screen:view"]),
        json!(null),
    ] {
        let mut stale = challenge.clone();
        stale["permissions"] = permissions;
        assert!(verify_device_challenge(&stale, &scope, &decision, "approve").is_err());
    }
    assert!(verify_device_challenge(&challenge, &scope, &decision, "deny").is_err());
    let mut denied = challenge;
    denied["purpose"] = json!("deny");
    assert!(verify_device_challenge(&denied, &scope, &decision, "deny").is_ok());
}
