use super::*;
fn receipt() -> Receipt {
    Receipt {
        account: account_binding("private-account-code"),
        host: "a".repeat(64),
        device: "b".repeat(64),
        approved_at: "2026-10-08T12:00:00Z".into(),
        generation: "first".into(),
    }
}
#[test]
fn cold_restart_keeps_only_public_bindings_and_no_account_credential() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("grant.json");
    let grants = Grants::load(path.clone());
    assert!(
        grants.current().is_none(),
        "pairing metadata never creates a grant"
    );
    grants.mint(receipt()).unwrap();
    let stored = std::fs::read_to_string(&path).unwrap();
    assert!(!stored.contains("private-account-code"));
    assert!(!stored.contains("token"));
    assert_eq!(Grants::load(path).current(), Some(receipt()));
}
#[test]
fn same_approval_keeps_generation_but_reapproval_replaces_it() {
    let dir = tempfile::tempdir().unwrap();
    let grants = Grants::load(dir.path().join("grant.json"));
    grants.mint(receipt()).unwrap();
    let mut next = receipt();
    next.generation = "new-read".into();
    grants.mint(next.clone()).unwrap();
    assert_eq!(grants.current().unwrap().generation, "first");
    next.approved_at = "replacement-device-approval".into();
    grants.mint(next.clone()).unwrap();
    assert_eq!(grants.current(), Some(next));
}
#[test]
fn revocation_survives_restart_and_invalidates_captured_generation() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("grant.json");
    let grants = Grants::load(path.clone());
    grants.mint(receipt()).unwrap();
    let captured = grants.current();
    grants.revoke().unwrap();
    assert_ne!(grants.current(), captured);
    assert!(Grants::load(path).current().is_none());
}
#[test]
fn malformed_storage_fails_closed_even_if_minting_is_requested() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("grant.json");
    std::fs::write(&path, "broken").unwrap();
    let grants = Grants::load(path);
    assert!(grants.current().is_none());
    assert!(grants.mint(receipt()).is_err());
}
#[test]
fn domain_binding_changes_across_accounts_and_is_not_a_raw_code() {
    assert_ne!(account_binding("A"), account_binding("B"));
    assert_ne!(
        account_binding("A"),
        Sha256::digest("A")
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    );
    assert_eq!(account_binding("A").len(), 64);
}
#[test]
fn failed_revocation_disables_current_process_even_when_disk_is_unwritable() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("grant.json");
    let grants = Grants::load(path.clone());
    grants.mint(receipt()).unwrap();
    std::fs::remove_file(&path).unwrap();
    std::fs::create_dir(&path).unwrap();
    assert!(grants.revoke().is_err());
    assert!(grants.current().is_none());
    assert!(grants.mint(receipt()).is_err());
}
#[cfg(unix)]
#[test]
fn receipt_file_is_private() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("grant.json");
    Grants::load(path.clone()).mint(receipt()).unwrap();
    assert_eq!(
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
        0o600
    );
}

#[test]
fn stale_same_account_revocation_never_clears_a_replacement_approval() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("grant.json");
    let grants = Grants::load(path.clone());
    grants.mint(receipt()).unwrap();
    let captured = grants.current().unwrap();
    let mut next = receipt();
    next.approved_at = "fresh-approval".into();
    next.generation = "new".into();
    grants.mint(next.clone()).unwrap();
    assert!(!grants.revoke_matching(Some(&captured)).unwrap());
    assert_eq!(grants.current(), Some(next.clone()));
    assert_eq!(Grants::load(path).current(), Some(next));
}
#[test]
fn stale_empty_receipt_read_never_clears_a_concurrently_minted_approval() {
    let dir = tempfile::tempdir().unwrap();
    let grants = Grants::load(dir.path().join("grant.json"));
    assert!(grants.current().is_none());
    grants.mint(receipt()).unwrap();
    assert!(!grants.revoke_matching(None).unwrap());
    assert_eq!(grants.current(), Some(receipt()));
    assert!(grants.revoke_matching(Some(&receipt())).unwrap());
    assert!(grants.current().is_none());
}
