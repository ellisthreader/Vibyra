use super::*;

fn grant(path: PathBuf, source_path: Option<PathBuf>, can_write: bool) -> Grant {
    Grant {
        id: "workspace".into(),
        agent_id: "agent".into(),
        host_id: "host".into(),
        account_scope: "account".into(),
        label: "Project".into(),
        path,
        source_path,
        path_identity: None,
        source_identity: None,
        can_write,
        revoked: false,
    }
}

#[test]
fn damaged_or_exposed_store_fails_closed() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("grants.json");
    save(&file, &[]).unwrap();
    assert!(load(&file).unwrap().is_empty());
    std::fs::write(&file, "not json").unwrap();
    assert!(load(&file).is_err());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(load(&file).is_err());
    }
}

#[test]
fn legacy_grants_require_a_new_folder_choice() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    let mut edit = grant(root.clone(), None, true);
    assert!(edit.validate_path().is_err());
    edit.source_path = Some(root.clone());
    #[cfg(any(unix, windows))]
    assert!(edit.validate_path().is_err());
    edit = edit.bind_identity().unwrap();
    assert!(edit.validate_path().is_ok());
    let read = grant(root.clone(), None, false);
    #[cfg(any(unix, windows))]
    assert!(read.validate_path().is_err());
    assert!(read.bind_identity().unwrap().validate_path().is_ok());
}

#[test]
fn a_grant_saved_before_folder_identity_still_loads_but_is_not_usable() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    let file = dir.path().join("grants.json");
    let legacy = serde_json::json!([{"id":"workspace","agentId":"agent","hostId":"host",
        "accountScope":"account","label":"Project","path":root,"revoked":false}]);
    std::fs::write(&file, legacy.to_string()).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600)).unwrap();
    }
    let grants = load(&file).unwrap();
    assert_eq!(grants.len(), 1);
    assert!(grants[0].path_identity.is_none() && !grants[0].can_write);
    #[cfg(any(unix, windows))]
    assert!(grants[0].validate_path().is_err());
    // The bound identity survives a save/load round trip.
    let bound = grants[0].clone().bind_identity().unwrap();
    save(&file, std::slice::from_ref(&bound)).unwrap();
    assert_eq!(load(&file).unwrap(), vec![bound]);
}

#[test]
fn worktree_lookup_uses_current_account_and_local_grant() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source");
    let worktree = dir.path().join("worktree");
    std::fs::create_dir(&source).unwrap();
    std::fs::create_dir(&worktree).unwrap();
    let mut active = grant(
        worktree.canonicalize().unwrap(),
        Some(source.canonicalize().unwrap()),
        true,
    )
    .bind_identity()
    .unwrap();
    let file = dir.path().join("grants.json");
    save(&file, std::slice::from_ref(&active)).unwrap();
    assert_eq!(
        active_worktree(&file, "account", "workspace").unwrap(),
        active
    );
    assert!(active_worktree(&file, "another", "workspace").is_err());
    active.revoked = true;
    save(&file, &[active]).unwrap();
    assert!(active_worktree(&file, "account", "workspace").is_err());
}

#[cfg(any(unix, windows))]
#[test]
fn replaced_folder_at_same_path_loses_its_grant() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source");
    let worktree = dir.path().join("worktree");
    std::fs::create_dir(&source).unwrap();
    std::fs::create_dir(&worktree).unwrap();
    let source = source.canonicalize().unwrap();
    let worktree = worktree.canonicalize().unwrap();
    let active = grant(worktree.clone(), Some(source.clone()), true)
        .bind_identity()
        .unwrap();
    let file = dir.path().join("grants.json");
    save(&file, std::slice::from_ref(&active)).unwrap();
    std::fs::rename(&worktree, dir.path().join("old-worktree")).unwrap();
    std::fs::create_dir(&worktree).unwrap();
    assert!(active.validate_path().is_err());
    assert!(active_worktree(&file, "account", "workspace").is_err());
    std::fs::remove_dir(&worktree).unwrap();
    std::fs::rename(dir.path().join("old-worktree"), &worktree).unwrap();
    assert!(active.validate_path().is_ok());
    std::fs::rename(&source, dir.path().join("old-source")).unwrap();
    std::fs::create_dir(&source).unwrap();
    assert!(active.validate_path().is_err());
    assert!(active_worktree(&file, "account", "workspace").is_err());
}

#[cfg(unix)]
#[test]
fn a_symlink_swapped_in_for_the_granted_folder_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let granted = dir.path().join("granted");
    let elsewhere = dir.path().join("elsewhere");
    std::fs::create_dir(&granted).unwrap();
    std::fs::create_dir(&elsewhere).unwrap();
    let granted = granted.canonicalize().unwrap();
    let active = grant(granted.clone(), None, false).bind_identity().unwrap();
    std::fs::rename(&granted, dir.path().join("old-granted")).unwrap();
    std::os::unix::fs::symlink(&elsewhere, &granted).unwrap();
    assert!(active.validate_path().is_err());
    assert!(capture_folder(&granted).is_err());
}

#[cfg(any(unix, windows))]
#[test]
fn replacement_between_picker_and_registration_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("selected");
    std::fs::create_dir(&source).unwrap();
    let source = source.canonicalize().unwrap();
    let selected = capture_folder(&source).unwrap();
    std::fs::rename(&source, dir.path().join("old-selected")).unwrap();
    std::fs::create_dir(&source).unwrap();
    assert!(grant(source.clone(), Some(source), true)
        .bind_selected_identity(selected)
        .is_err());
}
