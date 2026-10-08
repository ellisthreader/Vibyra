//! A real engine, a real shadow repo and a cloud snapshot fetched into it (no network: the client is never used).

use std::path::{Path, PathBuf};
use vibyra_sync::cloud::{diff_files, find_base};
use vibyra_sync::paths::{project_key, shadow_dir};
use vibyra_sync::snapshot::take_snapshot;
use vibyra_sync::state::{ProjectState, Store};
use vibyra_sync::{
    Client, CloudChange, DeviceKeys, Engine, ProjectRef, SnapshotOptions, SnapshotOutcome,
};

pub fn write(root: &Path, rel: &str, text: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn snapshot(root: &Path, shadow: &Path) -> String {
    match take_snapshot(root, shadow, &SnapshotOptions::default()).unwrap() {
        SnapshotOutcome::Taken(s) => s.commit,
        _ => panic!("expected a snapshot"),
    }
}

pub struct Scene {
    pub _state: tempfile::TempDir,
    pub _project: tempfile::TempDir,
    pub _cloud: tempfile::TempDir,
    pub engine: Engine,
    pub project: ProjectRef,
    pub root: PathBuf,
}

/// Mac snapshot = a, b, c, node_modules/x.js. Cloud snapshot = a edited, c removed, d added,
/// b untouched, and a change inside node_modules (never applicable).
pub fn scene() -> Scene {
    let state = tempfile::tempdir().unwrap();
    let project_dir = tempfile::tempdir().unwrap();
    let cloud_dir = tempfile::tempdir().unwrap();
    let root = project_dir.path().to_path_buf();
    for (p, t) in [
        ("a.txt", "one"),
        ("b.txt", "two"),
        ("c.txt", "three"),
        ("vendor/lib.php", "v1"),
    ] {
        write(&root, p, t);
    }
    let key = project_key("p1");
    let shadow = shadow_dir(state.path(), &key);
    let mine = snapshot(&root, &shadow);

    let cloud = cloud_dir.path();
    for (p, t) in [
        ("a.txt", "ONE"),
        ("b.txt", "two"),
        ("d.txt", "four"),
        ("vendor/lib.php", "v2"),
    ] {
        write(cloud, p, t);
    }
    let cloud_shadow = state.path().join("cloud-shadow.git");
    snapshot(cloud, &cloud_shadow);
    let status = std::process::Command::new("git")
        .args([
            "--git-dir",
            shadow.to_str().unwrap(),
            "fetch",
            "-q",
            cloud_shadow.to_str().unwrap(),
            "refs/vibyra/snap:refs/vibyra/cloud",
        ])
        .status()
        .unwrap();
    assert!(status.success());
    let head = String::from_utf8(
        std::process::Command::new("git")
            .args([
                "--git-dir",
                shadow.to_str().unwrap(),
                "rev-parse",
                "refs/vibyra/cloud",
            ])
            .output()
            .unwrap()
            .stdout,
    )
    .unwrap()
    .trim()
    .to_string();
    let base = find_base(&shadow, &head, Some(&mine));
    let files = diff_files(&shadow, base.as_deref(), &head).unwrap();
    let change = CloudChange {
        project_key: key.clone(),
        project: "app".into(),
        seq: 7,
        head,
        base,
        files,
    };
    Store::new(state.path())
        .save(&ProjectState {
            project_key: key,
            name: "app".into(),
            up_seq: 1,
            up_head: Some(mine),
            cloud: vec![change],
            ..Default::default()
        })
        .unwrap();
    let engine = Engine::new(
        state.path(),
        Client::new("http://127.0.0.1:9", "token").unwrap(),
        DeviceKeys::from_secret(uuid::Uuid::new_v4().to_string(), [7u8; 32]),
    );
    let project = ProjectRef {
        id: "p1".into(),
        name: "App".into(),
        root: root.clone(),
    };
    Scene {
        _state: state,
        _project: project_dir,
        _cloud: cloud_dir,
        engine,
        project,
        root,
    }
}
