//! Checks the real workspace operation after filesystem inspection.
use std::{process::Command, sync::Arc};
#[test]
fn denied_live_grant_creates_no_worktree_directory_or_branch() {
    let dir = tempfile::tempdir().unwrap();
    let repo = dir.path().join("repo");
    std::fs::create_dir(&repo).unwrap();
    assert!(Command::new("git")
        .arg("init")
        .arg(&repo)
        .output()
        .unwrap()
        .status
        .success());
    std::fs::write(repo.join("file"), "content").unwrap();
    super::git(&repo, &["add", "."]).unwrap();
    assert!(Command::new("git")
        .arg("-C")
        .arg(&repo)
        .args([
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.com",
            "commit",
            "-m",
            "fixture"
        ])
        .output()
        .unwrap()
        .status
        .success());
    let target = dir.path().join("worktrees");
    let denied = crate::preview::with_launch_authorization(
        Arc::new(|_| Err(crate::CoreError::Settings("revoked fixture grant".into()))),
        || super::prepare_safe_workspace(&repo, &target, None),
    );
    assert!(denied.unwrap_err().to_string().contains("revoked"));
    assert!(
        !target.exists(),
        "revocation after inspection must not create folders"
    );
    assert!(super::git(&repo, &["branch", "--list", "vibyra/*"])
        .unwrap()
        .is_empty());
}
