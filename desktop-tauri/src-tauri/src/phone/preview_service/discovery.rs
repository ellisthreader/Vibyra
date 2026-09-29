//! Bounded discovery of HTTP sites owned by an open project folder.
//! Inspect listener PIDs and their cwd, never process arguments or terminal text.
use std::path::{Path, PathBuf};

#[path = "discovery_attached.rs"]
mod attached;
#[path = "discovery_probe.rs"]
mod probe;
use super::discovery_system as system;
pub(super) use attached::running_for_root;
pub(super) use probe::listener;
use probe::probe;
use std::time::Duration;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct DetectedServer {
    pub project_id: String,
    /// The open project the site belongs to.
    pub project_root: PathBuf,
    /// The folder serving it: the project itself, or an agent's git worktree of it.
    pub root: PathBuf,
    pub ipv6: bool,
    pub pid: u32,
    pub started_at: i64,
    pub port: u16,
    pub start_path: String,
}

pub(super) fn running(projects: &[(String, PathBuf)]) -> Vec<DetectedServer> {
    use std::collections::HashSet;
    let roots = projects
        .iter()
        .filter_map(|(id, root)| root.canonicalize().ok().map(|path| (id.clone(), path)))
        .collect::<Vec<_>>();
    if roots.is_empty() {
        return Vec::new();
    }
    let Some(listeners) = system::listeners(Duration::from_millis(2000)) else {
        return Vec::new();
    };
    let pids = listeners.iter().map(|l| l.pid).collect::<HashSet<_>>();
    // A busy computer lists hundreds of listeners; beyond this the lookups stop being cheap.
    if pids.is_empty() || pids.len() > 256 {
        return Vec::new();
    }
    let pids = pids.into_iter().collect::<Vec<_>>();
    let (workdirs, started) = (system::cwds(&pids), system::started(&pids));
    let mut candidates = listeners
        .into_iter()
        .filter_map(|listener| {
            let cwd = workdirs.get(&listener.pid)?;
            let (project_id, project_root, root) = owner(&roots, cwd)?;
            let started_at = *started.get(&listener.pid)?;
            Some((
                started_at,
                DetectedServer {
                    project_id,
                    project_root,
                    root,
                    ipv6: listener.ipv6,
                    pid: listener.pid,
                    started_at,
                    port: listener.port,
                    start_path: "/".into(),
                },
            ))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.port.cmp(&b.1.port)));
    let mut results = Vec::new();
    let mut seen = HashSet::new();
    let candidates = candidates
        .into_iter()
        .filter_map(|(_, candidate)| {
            seen.insert((candidate.project_id.clone(), candidate.port))
                .then_some(candidate)
        })
        .take(8)
        .collect::<Vec<_>>();
    std::thread::scope(|scope| {
        let probes = candidates
            .iter()
            .map(|candidate| {
                let (port, ipv6) = (candidate.port, candidate.ipv6);
                scope.spawn(move || probe(port, ipv6))
            })
            .collect::<Vec<_>>();
        for (mut candidate, probe) in candidates.into_iter().zip(probes) {
            if let Ok(Some(path)) = probe.join() {
                candidate.start_path = path;
                results.push(candidate);
            }
        }
    });
    results
}

/// The open project a process working in `cwd` belongs to: the deepest project
/// folder containing it, or, for an agent's git worktree kept outside the project,
/// the project whose checkout that worktree came from.
pub(super) fn owner(roots: &[(String, PathBuf)], cwd: &Path) -> Option<(String, PathBuf, PathBuf)> {
    if let Some((id, root)) = roots
        .iter()
        .filter(|(_, root)| cwd.starts_with(root))
        .max_by_key(|(_, root)| root.components().count())
    {
        return Some((id.clone(), root.clone(), root.clone()));
    }
    let (worktree, main) = worktree_of(cwd)?;
    // The project's folder inside the checkout, found at the same place in the worktree.
    roots
        .iter()
        .filter_map(|(id, root)| {
            let serving = worktree.join(root.strip_prefix(&main).ok()?);
            cwd.starts_with(&serving)
                .then(|| (id.clone(), root.clone(), serving))
        })
        .max_by_key(|(_, root, _)| root.components().count())
}

/// A git worktree folder holds a `.git` file, `gitdir: <checkout>/.git/worktrees/<name>`.
/// Only files are read, a few levels up: no git process per listener.
fn worktree_of(cwd: &Path) -> Option<(PathBuf, PathBuf)> {
    for dir in cwd.ancestors().take(12) {
        let marker = dir.join(".git");
        if marker.is_dir() {
            return None;
        }
        if !marker.is_file() {
            continue;
        }
        let text = std::fs::read_to_string(&marker).ok()?;
        let gitdir = PathBuf::from(text.strip_prefix("gitdir:")?.trim());
        let worktrees = gitdir.parent()?;
        if worktrees.file_name()? != "worktrees" || worktrees.parent()?.file_name()? != ".git" {
            return None;
        }
        let main = worktrees.parent()?.parent()?.canonicalize().ok()?;
        return Some((dir.to_path_buf(), main));
    }
    None
}

/// A page load makes dozens of requests, and each is checked against the process
/// that serves it. One check runs at a time and a confirmed owner is trusted for
/// ten seconds, so a burst of scripts neither spawns `ps` and `lsof` per file
/// nor races a dozen of them at once; the next check after that still catches a
/// stopped or replaced server, and opening Preview always checks afresh.
pub(super) fn owns(server: &DetectedServer) -> bool {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};
    type ConfirmedListeners = Mutex<HashMap<(u32, u16, i64), Instant>>;
    static CONFIRMED: OnceLock<ConfirmedListeners> = OnceLock::new();
    let key = (server.pid, server.port, server.started_at);
    let Ok(mut confirmed) = CONFIRMED.get_or_init(Default::default).lock() else {
        return owns_now(server);
    };
    confirmed.retain(|_, at| at.elapsed() < Duration::from_secs(10));
    if confirmed.contains_key(&key) {
        return true;
    }
    let owned = owns_now(server);
    if owned {
        confirmed.insert(key, Instant::now());
    }
    owned
}

/// Always asks the system, for opening Preview.
pub(super) fn owns_now(server: &DetectedServer) -> bool {
    let pid = [server.pid];
    system::started(&pid).get(&server.pid) == Some(&server.started_at)
        && system::listeners(Duration::from_millis(2000)).is_some_and(|listeners| {
            listeners
                .iter()
                .any(|l| l.pid == server.pid && l.port == server.port)
        })
        && system::cwds(&pid)
            .get(&server.pid)
            .is_some_and(|cwd| cwd.starts_with(&server.root))
}

#[cfg(test)]
#[path = "discovery_tests.rs"]
mod tests;
