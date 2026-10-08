#![allow(dead_code)]
//! An engine wired to the fake account server, a project folder and a stand-in VM repository.
use super::fake::{Fake, TOKEN};
use super::*;
use std::path::PathBuf;
use std::time::Duration;
use vibyra_sync::bundle::{fetch_bundle, verify_bundle};
use vibyra_sync::snapshot::SNAP_REF;
use vibyra_sync::*;

pub struct Rig {
    pub t: tempfile::TempDir,
    pub fake: Fake,
    pub engine: Engine,
    pub project: ProjectRef,
    pub home: PathBuf,
    pub vm: PathBuf,
}

pub fn rig() -> Rig {
    let t = tempfile::tempdir().unwrap();
    let fake = Fake::start();
    let state = t.path().join("state");
    let keys = DeviceKeys::load_or_create(&state, &FileSecrets(state.join("cloud-sync"))).unwrap();
    let client = Client::new(&fake.url, TOKEN)
        .unwrap()
        .with_retry(RetryPolicy {
            attempts: 3,
            base_delay: Duration::from_millis(5),
        });
    let engine = Engine::new(&state, client, keys);
    engine.register_mac("Test Mac").unwrap();
    let root = t.path().join("My App");
    write(&root, "a.txt", "one\n");
    write(&root, "src/lib.rs", "pub fn f() {}\n");
    let home = t.path().join("home");
    std::fs::create_dir_all(&home).unwrap();
    let vm = bare(t.path());
    Rig {
        t,
        fake,
        engine,
        project: ProjectRef {
            id: "proj-1".into(),
            name: "My App".into(),
            root,
        },
        home,
        vm,
    }
}

pub fn shadow_of(r: &Rig) -> PathBuf {
    r.engine
        .state_dir()
        .join("cloud-sync")
        .join(project_key(&r.project.id))
        .join("shadow.git")
}

pub fn opts(r: &Rig) -> SyncOptions {
    SyncOptions {
        home: Some(r.home.clone()),
        include_transcripts: false,
        ..Default::default()
    }
}

/// What the VM does with a code upload: open, verify, fetch into its own repo. Returns the VM's tree.
pub fn vm_apply(r: &Rig, blob: &super::fake::Blob) -> String {
    let f = r.t.path().join(format!("vm-{}.bundle", blob.seq));
    std::fs::write(&f, r.fake.open(blob)).unwrap();
    verify_bundle(&r.vm, &f).expect("prerequisites present at the VM");
    fetch_bundle(&r.vm, &f, SNAP_REF, SNAP_REF).unwrap();
    tree_of(&r.vm, SNAP_REF)
}
