use super::*;

fn command(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{:?}: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn creates_private_clean_worktree_without_running_hooks_or_filters() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    std::fs::create_dir(&source).unwrap();
    command(&source, &["init", "-q"]);
    command(&source, &["config", "core.autocrlf", "false"]);
    std::fs::write(source.join(".gitattributes"), "*.txt filter=probe\n").unwrap();
    std::fs::write(source.join("file.txt"), "before\n").unwrap();
    command(&source, &["add", "."]);
    command(
        &source,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "commit",
            "-qm",
            "start",
        ],
    );
    let marker = temp.path().join("outside-marker");
    let hook = source.join(".git/hooks/post-checkout");
    std::fs::write(&hook, format!("#!/bin/sh\ntouch '{}'\n", marker.display())).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    let filter = format!("sh -c 'touch \"{}\"; cat'", marker.display());
    command(&source, &["config", "filter.probe.clean", &filter]);
    command(&source, &["config", "filter.probe.smudge", &filter]);
    command(&source, &["config", "filter.probe.process", &filter]);
    assert!(classify_edit_source(&source).unwrap());
    let id = "123e4567-e89b-12d3-a456-426614174000";
    let worktree = prepare(&source, &temp.path().join("private"), id).unwrap();
    assert_eq!(
        std::fs::read_to_string(worktree.join("file.txt")).unwrap(),
        "before\n"
    );
    assert!(!marker.exists(), "Git executed a repository hook or filter");
    std::fs::write(worktree.join("file.txt"), "agent change\n").unwrap();
    assert_eq!(
        std::fs::read_to_string(source.join("file.txt")).unwrap(),
        "before\n"
    );
    assert!(prepare(&source, &temp.path().join("private"), id).is_err());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(temp.path().join("private"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o077, 0);
    }
}

#[test]
fn refuses_dirty_or_nested_source_without_changing_it() {
    let temp = tempfile::tempdir().unwrap();
    let plain = temp.path().join("plain");
    std::fs::create_dir(&plain).unwrap();
    assert!(!classify_edit_source(&plain).unwrap());
    let source = temp.path().join("source");
    std::fs::create_dir(&source).unwrap();
    command(&source, &["init", "-q"]);
    std::fs::write(source.join("file.txt"), "before\n").unwrap();
    command(&source, &["add", "."]);
    command(
        &source,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "commit",
            "-qm",
            "start",
        ],
    );
    let id = "123e4567-e89b-12d3-a456-426614174000";
    assert!(prepare(&source, &source.join("private"), id).is_err());
    assert!(!source.join("private").exists());
    std::fs::create_dir(source.join("nested")).unwrap();
    assert!(classify_edit_source(&source.join("nested")).is_err());
    assert!(preflight(&source.join("nested")).is_err());
    assert!(prepare(&source.join("nested"), &temp.path().join("private"), id).is_err());
    std::fs::write(source.join("file.txt"), "unsaved\n").unwrap();
    assert!(classify_edit_source(&source).is_err());
    assert!(preflight(&source).is_err());
    assert!(prepare(&source, &temp.path().join("private"), id).is_err());
    assert!(!temp.path().join("private").exists());
    assert_eq!(
        std::fs::read_to_string(source.join("file.txt")).unwrap(),
        "unsaved\n"
    );
}
