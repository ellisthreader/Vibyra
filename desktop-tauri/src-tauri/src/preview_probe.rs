//! Tells core Preview which windows belong to a desktop app it started:
//! windows whose owning process descends from the launch, nothing else.

use std::collections::HashSet;
use vibyra_core::preview::{DesktopProbe, PreviewWindow, ProbeSnapshot, TreeProcess};

pub(crate) struct Probe;

struct Snapshot {
    table: crate::process_table::Table,
    windows: Vec<crate::window_preview::WindowInfo>,
}

fn read(snapshot: &ProbeSnapshot) -> Option<&Snapshot> {
    snapshot.0.downcast_ref::<Snapshot>()
}

impl DesktopProbe for Probe {
    fn snapshot(&self) -> ProbeSnapshot {
        ProbeSnapshot(Box::new(Snapshot {
            table: crate::process_table::snapshot(),
            // Missing permission or no capture adapter reads as "no window
            // yet"; Preview status reports the reason separately.
            windows: crate::window_preview::list().unwrap_or_default(),
        }))
    }

    fn tree(&self, snapshot: &ProbeSnapshot, root: u32) -> Vec<TreeProcess> {
        read(snapshot).map_or_else(Vec::new, |snapshot| snapshot.table.tree(root))
    }

    fn windows(&self, snapshot: &ProbeSnapshot, tree: &[TreeProcess]) -> Vec<PreviewWindow> {
        let Some(snapshot) = read(snapshot) else {
            return Vec::new();
        };
        let own = std::process::id();
        let pids = tree
            .iter()
            .map(|process| process.pid)
            .filter(|pid| *pid != own)
            .collect::<HashSet<_>>();
        snapshot
            .windows
            .iter()
            .filter(|window| u32::try_from(window.pid).is_ok_and(|pid| pids.contains(&pid)))
            .map(|window| PreviewWindow {
                pid: window.pid as u32,
                id: window.id,
                fingerprint: window.fingerprint.clone(),
            })
            .collect()
    }

    fn still_running(&self, process: &TreeProcess) -> bool {
        crate::process_table::still_running(process)
    }
}
