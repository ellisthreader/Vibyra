use super::*;
use serde_json::json;

#[test]
fn only_starting_or_already_running_counts_as_an_idempotent_wake() {
    let wake = CloudAction::Wake;
    assert!(actions::accepted(&wake, 202, &json!({"state":"starting"})));
    assert!(actions::accepted(
        &wake,
        409,
        &json!({"code":"already_running"})
    ));
    for code in ["connect_required", "not_stopped", "capacity"] {
        assert!(!actions::accepted(&wake, 409, &json!({"code":code})));
    }
    assert!(!actions::accepted(
        &CloudAction::Stop,
        409,
        &json!({"code":"already_running"})
    ));
    assert!(!actions::accepted(&wake, 503, &json!({"code":"capacity"})));
}

#[test]
fn destructive_actions_require_confirmation_and_keys_are_not_paths() {
    assert!(action_request(&CloudAction::Disconnect, None, None, None, false, None).is_err());
    assert!(action_request(
        &CloudAction::Project,
        Some(&"a".repeat(32)),
        None,
        Some(false),
        false,
        None
    )
    .is_err());
    assert!(action_request(
        &CloudAction::Repair,
        Some("../account"),
        None,
        None,
        false,
        None
    )
    .is_err());
    let (endpoint, _) =
        action_request(&CloudAction::Disconnect, None, None, None, true, None).unwrap();
    assert_eq!(endpoint.method(), reqwest::Method::DELETE);
    assert_eq!(endpoint.path().unwrap(), "/api/cloud-computer/connect");
}

#[test]
fn provider_switches_cannot_target_arbitrary_endpoints_or_coerce_missing_choices() {
    assert!(action_request(
        &CloudAction::Provider,
        None,
        Some("../claude"),
        Some(true),
        false,
        None
    )
    .is_err());
    assert!(action_request(
        &CloudAction::Provider,
        None,
        Some("codex"),
        None,
        false,
        None
    )
    .is_err());
    let (endpoint, body) = action_request(
        &CloudAction::Provider,
        None,
        Some("github"),
        Some(false),
        false,
        None,
    )
    .unwrap();
    assert_eq!(
        endpoint.path().unwrap(),
        "/api/cloud-computer/access/integrations/github"
    );
    assert_eq!(body, Some(json!({"enabled":false})));
}
