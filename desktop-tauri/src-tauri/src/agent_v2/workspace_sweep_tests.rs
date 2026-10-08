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
    fs::File::open(&dir).unwrap().set_modified(old).unwrap();
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
    fs::File::open(&no_layout)
        .unwrap()
        .set_modified(SystemTime::now() - old)
        .unwrap();
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
