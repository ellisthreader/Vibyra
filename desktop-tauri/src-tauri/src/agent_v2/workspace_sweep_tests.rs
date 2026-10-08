use super::*;
use std::fs;

fn run_folder(base: &Path, name: &str, age: Duration) -> std::path::PathBuf {
    let dir = base.join(name);
    fs::create_dir_all(dir.join("ctl")).unwrap();
    fs::write(
        dir.join("ctl").join("broker.json"),
        "{\"token\":\"secret\"}",
    )
    .unwrap();
    let old = SystemTime::now() - age;
    set_modified(&dir, old);
    dir
}

#[test]
fn stale_run_folders_are_swept_and_everything_else_is_left_alone() {
    let base = tempfile::tempdir().unwrap();
    let old = Duration::from_secs(3600);
    let crashed = run_folder(base.path(), "vibyra-agent-crashed", old);
    let fresh = run_folder(base.path(), "vibyra-agent-fresh", Duration::from_secs(10));
    let live = run_folder(base.path(), "vibyra-agent-live", old);
    fs::write(live.join("ctl").join("alive"), b"").unwrap(); // a running run touches this
    let unrelated = run_folder(base.path(), "some-other-old-folder", old);
    let no_layout = base.path().join("vibyra-agent-plain");
    fs::create_dir(&no_layout).unwrap();
    set_modified(&no_layout, SystemTime::now() - old);
    let target = tempfile::tempdir().unwrap();
    fs::create_dir(target.path().join("ctl")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(target.path(), base.path().join("vibyra-agent-link")).unwrap();

    let removed = sweep(base.path(), Duration::from_secs(300), SystemTime::now());

    assert_eq!(removed, 1, "only the crashed run folder");
    assert!(!crashed.exists(), "its broker.json went with it");
    for kept in [&fresh, &live, &unrelated, &no_layout] {
        assert!(kept.exists(), "{kept:?} must stay");
    }
    assert!(
        target.path().join("ctl").exists(),
        "a link is never followed"
    );
}

#[test]
fn a_missing_base_folder_is_not_an_error() {
    assert_eq!(
        sweep(Path::new("/nonexistent/vibyra"), STALE, SystemTime::now()),
        0
    );
}

fn set_modified(path: &Path, modified: SystemTime) {
    #[cfg(windows)]
    let file = {
        use std::os::windows::fs::OpenOptionsExt;
        // Directory handles need BACKUP_SEMANTICS; set_modified needs only
        // FILE_WRITE_ATTRIBUTES, not read/write access to directory contents.
        fs::OpenOptions::new()
            .access_mode(0x100)
            .custom_flags(0x02000000)
            .open(path)
            .unwrap()
    };
    #[cfg(not(windows))]
    let file = fs::File::open(path).unwrap();
    file.set_modified(modified).unwrap();
}
