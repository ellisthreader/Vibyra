use super::listed_worktree;
use std::path::Path;

fn listing(path: &Path) -> Vec<u8> {
    format!(
        "worktree {}\0HEAD {}\0branch refs/heads/test\0\0",
        path.display(),
        "a".repeat(40)
    )
    .into_bytes()
}

#[test]
fn registration_matches_the_directory_not_git_path_spelling() {
    let temp = tempfile::tempdir().unwrap();
    let target = temp.path().join("worktree with spaces");
    std::fs::create_dir(&target).unwrap();
    let canonical = target.canonicalize().unwrap();
    assert!(listed_worktree(&listing(&target), &canonical));
    #[cfg(windows)]
    {
        let git_path = target.to_string_lossy().replace('\\', "/");
        assert!(listed_worktree(&listing(Path::new(&git_path)), &canonical));
    }
    assert!(!listed_worktree(&listing(temp.path()), &canonical));
    assert!(!listed_worktree(b"branch refs/heads/test\0", &canonical));
    assert!(!listed_worktree(b"worktree \xff\0", &canonical));
    assert!(!listed_worktree(
        &listing(&target.join("missing")),
        &canonical
    ));
}

#[cfg(unix)]
#[test]
fn a_registered_link_cannot_stand_in_for_the_managed_worktree() {
    let temp = tempfile::tempdir().unwrap();
    let target = temp.path().join("target");
    std::fs::create_dir(&target).unwrap();
    let link = temp.path().join("alias");
    std::os::unix::fs::symlink(&target, &link).unwrap();
    assert!(!listed_worktree(
        &listing(&link),
        &target.canonicalize().unwrap()
    ));
}
