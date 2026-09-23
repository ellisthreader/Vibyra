use super::*;

#[test]
fn choosing_publishes_a_read_only_project_and_routes_only_its_own_calls() {
    let root = tempfile::tempdir().unwrap();
    let state = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("Home.md"), "hello").unwrap();
    let vault = Vault::new(state.path().into());
    assert!(vault.project().is_none());
    let project = vault.choose(root.path().into()).unwrap();
    assert_eq!(project["filesAvailable"], true);
    let id = project["id"].as_str().unwrap().to_owned();
    assert!(vault.route(&id).is_some());
    assert!(vault.route("something-else").is_none());
    vault.clear().unwrap();
    assert!(vault.project().is_none());
    assert!(vault.route(&id).is_none());
}

#[test]
fn a_chosen_vault_survives_being_recreated_from_the_same_state_dir() {
    let root = tempfile::tempdir().unwrap();
    let state = tempfile::tempdir().unwrap();
    let project = {
        let first = Vault::new(state.path().into());
        first.choose(root.path().into()).unwrap()
    };
    // The prior Vault (and its Engine's own sqlite connection) must be gone
    // before the next one opens the same state dir, exactly as an actual
    // restart would leave it - two live Engines over one state dir at once
    // is not a shape this ever runs in.
    let restored = Vault::new(state.path().into());
    assert_eq!(restored.project().unwrap()["id"], project["id"]);
}
