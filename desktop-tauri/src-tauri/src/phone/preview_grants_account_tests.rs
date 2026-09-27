use super::preview_grants::PreviewGrants;
use std::fs;
use vibyra_core::preview::inspect_project;

#[test]
fn only_verified_same_account_can_use_a_persisted_grant() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("index.html"), "<h1>site</h1>").unwrap();
    let target = inspect_project(root.to_str().unwrap()).unwrap().targets[0]
        .id
        .clone();
    let state = temp.path().join("state");
    let grants = PreviewGrants::load(state.clone()).unwrap();
    assert!(grants.grant("phone", "project", &root, &target).is_err());
    grants.set_account(Some("user:alice")).unwrap();
    grants.grant("phone", "project", &root, &target).unwrap();
    assert!(grants.authorize("phone", "project", &root, &target).is_ok());
    grants.set_account(None).unwrap();
    assert!(grants.list_for_device("phone").is_empty());
    assert!(grants
        .authorize("phone", "project", &root, &target)
        .is_err());

    // A verified restore of Alice's same account can use her saved choice.
    let reloaded = PreviewGrants::load(state.clone()).unwrap();
    assert!(reloaded
        .authorize("phone", "project", &root, &target)
        .is_err());
    reloaded.set_account(Some("user:alice")).unwrap();
    assert!(reloaded
        .authorize("phone", "project", &root, &target)
        .is_ok());

    // Switching to Bob removes Alice's grant on disk, including if Alice
    // later signs in again on this machine.
    reloaded.set_account(Some("user:bob")).unwrap();
    assert!(reloaded.list_for_device("phone").is_empty());
    reloaded.set_account(Some("user:alice")).unwrap();
    assert!(reloaded
        .authorize("phone", "project", &root, &target)
        .is_err());
    let again = PreviewGrants::load(state).unwrap();
    again.set_account(Some("user:alice")).unwrap();
    assert!(again.list_for_device("phone").is_empty());
}

#[test]
fn legacy_unscoped_grants_are_never_reused() {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path().join("state");
    fs::create_dir(&state).unwrap();
    fs::write(state.join("preview-grants.json"), br#"{"version":2,"grants":[{"id":"old","deviceId":"phone","projectId":"project","sourceRoot":"/tmp","canonicalRoot":"/tmp","targetId":"static","targetFingerprint":"old"}]}"#).unwrap();
    let grants = PreviewGrants::load(state).unwrap();
    grants.set_account(Some("user:alice")).unwrap();
    assert!(grants.list_for_device("phone").is_empty());
}

#[test]
fn automatic_preview_requires_opt_in_and_same_verified_account() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("state");
    let grants = PreviewGrants::load(path.clone()).unwrap();
    assert!(!grants.automatic("phone"));
    assert!(grants.set_automatic("phone", true).is_err());
    grants.set_account(Some("user:alice")).unwrap();
    grants.set_automatic("phone", true).unwrap();
    assert!(grants.automatic("phone"));
    assert!(!grants.automatic("other"));
    grants.set_account(None).unwrap();
    assert!(!grants.automatic("phone"));
    let restored = PreviewGrants::load(path.clone()).unwrap();
    restored.set_account(Some("user:alice")).unwrap();
    assert!(restored.automatic("phone"));
    restored.revoke_device("phone").unwrap();
    assert!(!restored.automatic("phone"));
    restored.set_automatic("phone", true).unwrap();
    restored.set_account(Some("user:bob")).unwrap();
    assert!(!restored.automatic("phone"));
    restored.set_account(Some("user:alice")).unwrap();
    assert!(!restored.automatic("phone"));
}
