//! The rig the worker tests drive: fakes (`worker_fake`), a clock the tests move, and settings they edit.

pub(super) use std::path::PathBuf;
pub(super) use std::sync::atomic::{AtomicU64, Ordering};
pub(super) use std::sync::mpsc::channel;
pub(super) use std::sync::Arc;

pub(super) use parking_lot::Mutex;
pub(super) use vibyra_core::cloud_sync_settings::{CloudSyncSettings, CLOUD_SYNC_CONSENT_VERSION};
pub(super) use vibyra_sync::{project_key, CloudChange, ProjectRef, SyncError};

pub(super) use super::board::{Board, Gate};
pub(super) use super::port::{AutoApply, ChangeNotice, Config, Event};
pub(super) use super::schedule::{DEBOUNCE_MS, POLL_MS, SWEEP_MS};
pub(super) use super::worker::{Msg, Worker, ACCOUNT_MS};
pub(super) use super::worker_fake::{Fake, FakeEnv, FakePort};

pub(super) struct Rig {
    pub(super) worker: Worker<FakePort, FakeEnv>,
    pub(super) fake: Arc<Fake>,
    pub(super) cfg: Arc<Mutex<Config>>,
    pub(super) events: Arc<Mutex<Vec<Event>>>,
    pub(super) time: Arc<AtomicU64>,
    pub(super) board: Board,
}

pub(super) fn project(id: &str) -> ProjectRef {
    ProjectRef {
        id: id.into(),
        name: format!("Project {id}"),
        root: PathBuf::from(format!("/p/{id}")),
    }
}

pub(super) fn rig(ids: &[&str]) -> Rig {
    let fake = Arc::new(Fake {
        cloud_enabled: Mutex::new(true),
        ..Default::default()
    });
    let sync = CloudSyncSettings {
        consent_version: CLOUD_SYNC_CONSENT_VERSION,
        ..Default::default()
    };
    let cfg = Arc::new(Mutex::new(Config {
        signed_in: true,
        sync,
        projects: ids.iter().map(|i| project(i)).collect(),
        mac_name: "Mac".into(),
    }));
    let events = Arc::new(Mutex::new(Vec::new()));
    let time = Arc::new(AtomicU64::new(1_000));
    let clock = Arc::clone(&time);
    let board = Board::default();
    let worker = Worker::new(
        FakePort(Arc::clone(&fake)),
        FakeEnv {
            cfg: Arc::clone(&cfg),
            events: Arc::clone(&events),
        },
        Arc::clone(&board),
        Box::new(move || clock.load(Ordering::SeqCst)),
    );
    Rig {
        worker,
        fake,
        cfg,
        events,
        time,
        board,
    }
}

impl Rig {
    pub(super) fn settle(&mut self) -> u64 {
        for _ in 0..200 {
            if let Some(wait) = self.worker.step() {
                return wait;
            }
        }
        panic!("the worker never went idle");
    }
    pub(super) fn advance(&mut self, ms: u64) -> u64 {
        self.time.fetch_add(ms, Ordering::SeqCst);
        self.settle()
    }
    pub(super) fn calls(&self) -> Vec<String> {
        self.fake.calls.lock().clone()
    }
    pub(super) fn count(&self, prefix: &str) -> usize {
        self.calls()
            .iter()
            .filter(|c| c.starts_with(prefix))
            .count()
    }
}

pub(super) fn change(id: &str, seq: u64) -> CloudChange {
    CloudChange {
        project_key: project_key(id),
        project: id.into(),
        seq,
        head: "h".into(),
        base: None,
        files: vec![],
    }
}
