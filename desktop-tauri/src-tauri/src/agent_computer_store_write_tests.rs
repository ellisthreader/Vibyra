use super::*;
use crate::agent_computer_store::{active_worktree, load};

fn grant(root: &Path) -> Grant {
    let worktree = root.join("worktree");
    std::fs::create_dir(&worktree).unwrap();
    Grant {
        id: "fixture".into(),
        agent_id: "agent".into(),
        host_id: "host".into(),
        account_scope: "account".into(),
        label: "Project".into(),
        path: worktree.canonicalize().unwrap(),
        source_path: Some(root.canonicalize().unwrap()),
        can_write: false,
        revoked: false,
    }
}

fn no_pending(parent: &Path) {
    assert!(std::fs::read_dir(parent).unwrap().all(|entry| {
        entry
            .unwrap()
            .path()
            .extension()
            .is_none_or(|ext| ext != "pending")
    }));
}

#[test]
fn first_create_and_replacement_persist_revocation_privately() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("grants.json");
    let mut grant = grant(dir.path());
    save(&file, std::slice::from_ref(&grant)).unwrap();
    assert_eq!(active_worktree(&file, "account", "fixture").unwrap(), grant);
    grant.revoked = true;
    save(&file, std::slice::from_ref(&grant)).unwrap();
    assert_eq!(load(&file).unwrap(), [grant]);
    assert!(active_worktree(&file, "account", "fixture").is_err());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    no_pending(dir.path());
}

#[test]
fn failed_commit_preserves_complete_previous_grants_and_cleans_owned_pending() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("grants.json");
    let previous = grant(dir.path());
    save(&file, std::slice::from_ref(&previous)).unwrap();
    let bytes = std::fs::read(&file).unwrap();
    let result = save_with(&file, &[], |pending, destination, parent| {
        assert_eq!(destination.file_name(), file.file_name());
        assert_eq!(pending.parent(), Some(parent));
        assert!(
            load(pending).unwrap().is_empty(),
            "complete private candidate before commit"
        );
        Err("injected commit failure".into())
    });
    assert!(result.is_err());
    assert_eq!(std::fs::read(&file).unwrap(), bytes);
    assert_eq!(load(&file).unwrap(), [previous]);
    no_pending(dir.path());
}

#[test]
fn cannot_replace_a_directory_or_leave_a_partial_store() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("grants.json");
    std::fs::create_dir(&file).unwrap();
    std::fs::write(file.join("sentinel"), b"preserve").unwrap();
    assert!(save(&file, &[]).is_err());
    assert_eq!(std::fs::read(file.join("sentinel")).unwrap(), b"preserve");
    assert!(load(&file).is_err());
    no_pending(dir.path());
}

#[cfg(windows)]
#[test]
fn denied_windows_replacement_preserves_original_grants() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("grants.json");
    let previous = grant(dir.path());
    save(&file, std::slice::from_ref(&previous)).unwrap();
    let held = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&file)
        .unwrap();
    assert!(save(&file, &[]).is_err());
    drop(held);
    assert_eq!(load(&file).unwrap(), [previous]);
    no_pending(dir.path());
}
