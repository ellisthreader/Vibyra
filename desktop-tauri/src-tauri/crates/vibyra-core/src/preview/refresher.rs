//! Watches running desktop apps for their windows. Core cannot see windows or
//! other processes itself; the app supplies a [`DesktopProbe`], and one
//! background thread asks it about every live desktop run once a second.

use std::any::Any;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Weak};
use std::thread;
use std::time::Duration;

use super::manager::PreviewManager;
use super::types::{PreviewStatus, PreviewWindow};

const TICK: Duration = Duration::from_secs(1);

/// One process in a run's tree. `start` is whatever stable start time the
/// platform reports, so a reused pid is never mistaken for one of ours.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreeProcess {
    pub pid: u32,
    pub start: u64,
    pub name: String,
}

/// A read of the computer's processes and windows, taken once per tick and
/// shared by every run.
pub struct ProbeSnapshot(pub Box<dyn Any + Send + Sync>);

pub trait DesktopProbe: Send + Sync {
    fn snapshot(&self) -> ProbeSnapshot;
    /// `root` and everything it started, however deep.
    fn tree(&self, snapshot: &ProbeSnapshot, root: u32) -> Vec<TreeProcess>;
    /// Windows whose owning process is in `tree`. Never matched by title.
    fn windows(&self, snapshot: &ProbeSnapshot, tree: &[TreeProcess]) -> Vec<PreviewWindow>;
    /// Whether this exact process (pid and start) is still running.
    fn still_running(&self, process: &TreeProcess) -> bool;
}

/// A desktop run changed phase, stage or windows, or was stopped.
#[derive(Clone, Debug)]
pub struct PreviewEvent {
    pub root: String,
    pub target_id: String,
    pub runtime_id: u64,
    pub status: PreviewStatus,
}

pub type PreviewListener = Arc<dyn Fn(PreviewEvent) + Send + Sync>;

pub(super) fn ensure_running(manager: &PreviewManager) {
    if manager.refreshing.swap(true, Ordering::SeqCst) {
        return;
    }
    let weak = manager.me.clone();
    let spawned = thread::Builder::new()
        .name("vibyra-preview-refresh".into())
        .spawn(move || run(weak));
    if spawned.is_err() {
        manager.refreshing.store(false, Ordering::SeqCst);
    }
}

fn run(manager: Weak<PreviewManager>) {
    loop {
        thread::sleep(TICK);
        let Some(manager) = manager.upgrade() else {
            return;
        };
        if manager.tick() {
            continue;
        }
        manager.refreshing.store(false, Ordering::SeqCst);
        // A run registered between the empty tick and the store above found
        // the flag still set and relied on this thread: take it back.
        if !manager.has_live_desktop() || manager.refreshing.swap(true, Ordering::SeqCst) {
            return;
        }
    }
}

impl PreviewManager {
    /// Lets desktop runs find their windows. Without one they stay waiting.
    pub fn set_desktop_probe(&self, probe: Arc<dyn DesktopProbe>) {
        *self.probe.lock() = Some(probe);
    }

    /// Told of every desktop run change, outside every lock.
    pub fn set_listener(&self, listener: PreviewListener) {
        *self.listener.lock() = Some(listener);
    }

    /// One pass over every live desktop run with a single snapshot. False
    /// when none is left, so the thread can stop.
    pub(super) fn tick(&self) -> bool {
        let services = self
            .services
            .lock()
            .iter()
            .map(|(key, service)| (key.clone(), Arc::clone(service)))
            .collect::<Vec<_>>();
        // A service busy under its own lock is kept: it may be a live run.
        let live = services
            .into_iter()
            .filter(|(_, service)| service.try_lock().is_none_or(|s| s.is_live_desktop()))
            .collect::<Vec<_>>();
        if live.is_empty() {
            return false;
        }
        let probe = self.probe.lock().clone();
        let snapshot = probe.as_ref().map(|probe| probe.snapshot());
        let mut events = Vec::new();
        for (key, service) in live {
            let Some(mut service) = service.try_lock() else {
                continue;
            };
            let before = signature(&service.status());
            match (&probe, &snapshot) {
                (Some(probe), Some(snapshot)) => service.refresh_desktop(probe.as_ref(), snapshot),
                _ => service.refresh_desktop_exit(),
            }
            let status = service.status();
            if signature(&status) != before {
                let root = key.split('\0').next().unwrap_or_default().to_owned();
                events.push((root, service.runtime_id, status));
            }
        }
        for (root, runtime_id, status) in events {
            self.emit(&root, runtime_id, &status);
        }
        true
    }

    pub(super) fn has_live_desktop(&self) -> bool {
        self.services
            .lock()
            .values()
            .any(|service| service.try_lock().is_none_or(|s| s.is_live_desktop()))
    }

    /// Desktop runs only: web previews keep being polled as before.
    pub(super) fn emit(&self, root: &str, runtime_id: u64, status: &PreviewStatus) {
        if status.stage.is_none() {
            return;
        }
        let listener = self.listener.lock().clone();
        if let Some(listener) = listener {
            listener(PreviewEvent {
                root: root.to_owned(),
                target_id: status.target_id.clone(),
                runtime_id,
                status: status.clone(),
            });
        }
    }
}

type Signature = (
    super::types::PreviewPhase,
    Option<super::types::DesktopStage>,
    Vec<PreviewWindow>,
    Option<String>,
);

fn signature(status: &PreviewStatus) -> Signature {
    (
        status.phase.clone(),
        status.stage,
        status.windows.clone(),
        status.error.clone(),
    )
}
