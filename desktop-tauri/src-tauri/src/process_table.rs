//! Process ancestry binds windows to apps Vibyra started on each platform.

use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use vibyra_core::preview::TreeProcess;

/// A process tree larger than this is not an app launch; stop looking.
const MAX_TREE: usize = 512;

#[derive(Clone, Debug)]
pub(crate) struct Entry {
    pub parent: Option<u32>,
    pub start: u64,
    pub name: String,
}

#[derive(Default)]
pub(crate) struct Table {
    entries: HashMap<u32, Entry>,
}

fn system() -> &'static Mutex<System> {
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    SYSTEM.get_or_init(|| {
        // See perf.rs: without this, Linux keeps a stat handle per process.
        sysinfo::set_open_files_limit(0);
        Mutex::new(System::new())
    })
}

fn kind() -> ProcessRefreshKind {
    ProcessRefreshKind::nothing().without_tasks()
}

/// Every process with its parent, start time and name.
pub(crate) fn snapshot() -> Table {
    let mut system = system().lock();
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, kind());
    let entries = system
        .processes()
        .iter()
        .map(|(pid, process)| {
            let entry = Entry {
                parent: process.parent().map(|parent| parent.as_u32()),
                start: process.start_time(),
                name: process.name().to_string_lossy().into_owned(),
            };
            (pid.as_u32(), entry)
        })
        .collect();
    Table { entries }
}

impl Table {
    #[cfg(test)]
    pub(crate) fn from_entries(entries: HashMap<u32, Entry>) -> Self {
        Self { entries }
    }

    #[cfg(target_os = "macos")]
    pub(crate) fn pids(&self) -> Vec<u32> {
        self.entries.keys().copied().collect()
    }

    #[cfg(target_os = "macos")]
    pub(crate) fn name(&self, pid: u32) -> Option<String> {
        self.entries.get(&pid).map(|entry| entry.name.clone())
    }

    /// Breadth-first descendants of `root`, excluding children predating their parent.
    pub(crate) fn tree(&self, root: u32) -> Vec<TreeProcess> {
        let Some(entry) = self.entries.get(&root) else {
            return Vec::new();
        };
        let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
        for (pid, entry) in &self.entries {
            if let Some(parent) = entry.parent.filter(|parent| parent != pid) {
                children.entry(parent).or_default().push(*pid);
            }
        }
        let mut found = vec![process(root, entry)];
        let mut index = 0;
        while index < found.len() && found.len() < MAX_TREE {
            let parent = found[index].clone();
            for child in children.get(&parent.pid).into_iter().flatten() {
                let Some(entry) = self.entries.get(child) else {
                    continue;
                };
                if entry.start + 1 < parent.start || found.iter().any(|p| p.pid == *child) {
                    continue;
                }
                found.push(process(*child, entry));
                if found.len() >= MAX_TREE {
                    break;
                }
            }
            index += 1;
        }
        found
    }
}

fn process(pid: u32, entry: &Entry) -> TreeProcess {
    TreeProcess {
        pid,
        start: entry.start,
        name: entry.name.clone(),
    }
}

/// Whether exactly this process — same pid, same start — is still running.
pub(crate) fn still_running(process: &TreeProcess) -> bool {
    let mut system = system().lock();
    let pid = Pid::from_u32(process.pid);
    system.refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), true, kind());
    system
        .process(pid)
        .is_some_and(|found| found.start_time() == process.start)
}

/// Start times (Unix seconds) of `pids` that are running.
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub(crate) fn starts(pids: &[u32]) -> HashMap<u32, u64> {
    let mut system = system().lock();
    let pids = pids
        .iter()
        .map(|pid| Pid::from_u32(*pid))
        .collect::<Vec<_>>();
    system.refresh_processes_specifics(ProcessesToUpdate::Some(&pids), true, kind());
    pids.iter()
        .filter_map(|pid| Some((pid.as_u32(), system.process(*pid)?.start_time())))
        .collect()
}

/// Working directories for `pids`, where the OS lets this user read them.
pub(crate) fn cwds(pids: &[u32]) -> HashMap<u32, PathBuf> {
    let mut system = system().lock();
    let pids = pids
        .iter()
        .map(|pid| Pid::from_u32(*pid))
        .collect::<Vec<_>>();
    let kind = kind().with_cwd(UpdateKind::Always);
    system.refresh_processes_specifics(ProcessesToUpdate::Some(&pids), true, kind);
    pids.iter()
        .filter_map(|pid| {
            let cwd = system.process(*pid)?.cwd()?.to_owned();
            Some((pid.as_u32(), cwd))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(parent: Option<u32>, start: u64, name: &str) -> Entry {
        Entry {
            parent,
            start,
            name: name.into(),
        }
    }

    #[test]
    fn finds_a_deep_launch_chain_and_ignores_reused_pids() {
        let table = Table::from_entries(HashMap::from([
            (10, entry(Some(1), 100, "npm")),
            (11, entry(Some(10), 101, "sh")),
            (12, entry(Some(11), 102, "node")),
            (13, entry(Some(12), 103, "cargo")),
            (14, entry(Some(13), 110, "hke-desktop")),
            // Claims pid 14 as parent but started long before it: a reused pid.
            (15, entry(Some(14), 50, "stale")),
            (20, entry(Some(1), 100, "unrelated")),
        ]));
        let names = table
            .tree(10)
            .into_iter()
            .map(|process| process.name)
            .collect::<Vec<_>>();
        assert_eq!(names, ["npm", "sh", "node", "cargo", "hke-desktop"]);
    }

    #[test]
    fn sees_this_test_process_and_its_start_time() {
        let table = snapshot();
        let me = std::process::id();
        let tree = table.tree(me);
        assert_eq!(tree[0].pid, me);
        assert!(still_running(&tree[0]));
        let wrong = TreeProcess {
            start: tree[0].start + 10,
            ..tree[0].clone()
        };
        assert!(!still_running(&wrong));
    }
}
