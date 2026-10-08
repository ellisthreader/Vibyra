//! Which Codex session a terminal runs, read from the rollout file its process
//! holds open. Recency cannot tell two chats in one folder apart; the open file
//! can. Linux only (`/proc`, no `lsof` on the VM); elsewhere nothing is found.
use crate::agent_session::valid_id;
use std::{
    collections::{HashMap, HashSet},
    io::Read,
    path::Path,
};

const MAX_PROCESSES: usize = 65_536;
const MAX_FDS: usize = 4_096;

/// The session id in `<codex_home>/sessions/**/rollout-<time>-<id>.jsonl`.
pub(crate) fn rollout_id(path: &Path, codex_home: &Path) -> Option<String> {
    path.strip_prefix(codex_home.join("sessions")).ok()?;
    let name = path.file_name()?.to_str()?;
    let stem = name.strip_prefix("rollout-")?.strip_suffix(".jsonl")?;
    let id = stem.get(stem.len().checked_sub(36)?..)?;
    valid_id(id).then(|| id.to_owned())
}

/// The one rollout id held open by `pid` or its closest descendants (`codex` is
/// a node wrapper around a native binary). Two different ids at the nearest
/// depth that has any is ambiguous and yields nothing rather than a guess.
pub(crate) fn discover(proc_root: &Path, pid: u32, codex_home: &Path) -> Option<String> {
    let parents = parents(proc_root)?;
    let root = codex_home
        .canonicalize()
        .unwrap_or_else(|_| codex_home.to_path_buf());
    let mut level = vec![pid];
    let mut seen = HashSet::from([pid]);
    for _ in 0..=3 {
        let ids: HashSet<String> = level
            .iter()
            .flat_map(|pid| open_files(&proc_root.join(pid.to_string()).join("fd")))
            .filter_map(|file| rollout_id(&file, &root))
            .collect();
        if ids.len() == 1 {
            return ids.into_iter().next();
        }
        if ids.len() > 1 {
            return None;
        }
        level = parents
            .iter()
            .filter(|(child, parent)| level.contains(parent) && seen.insert(**child))
            .map(|(child, _)| *child)
            .collect();
        if level.is_empty() {
            return None;
        }
    }
    None
}

fn parents(proc_root: &Path) -> Option<HashMap<u32, u32>> {
    let mut parents = HashMap::new();
    for entry in std::fs::read_dir(proc_root).ok()?.flatten() {
        let Some(pid) = entry.file_name().to_str().and_then(|n| n.parse().ok()) else {
            continue;
        };
        if parents.len() >= MAX_PROCESSES {
            return None;
        }
        let mut raw = String::new();
        if std::fs::File::open(entry.path().join("stat"))
            .and_then(|file| file.take(4096).read_to_string(&mut raw))
            .is_ok()
        {
            if let Some(parent) = parent_id(&raw) {
                parents.insert(pid, parent);
            }
        }
    }
    Some(parents)
}

/// The command name can hold spaces and `)`, so state and PPID start after the
/// last closing parenthesis.
fn parent_id(stat: &str) -> Option<u32> {
    stat.rsplit_once(") ")?
        .1
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()
}

fn open_files(directory: &Path) -> Vec<std::path::PathBuf> {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    let entries: Vec<_> = entries.take(MAX_FDS + 1).collect();
    // A partial list could hide a second rollout and invent an exact match.
    if entries.len() > MAX_FDS {
        return Vec::new();
    }
    entries
        .into_iter()
        .flatten()
        .filter_map(|entry| std::fs::read_link(entry.path()).ok())
        .filter(|path| path.is_absolute())
        .collect()
}

#[cfg(all(test, unix))]
#[path = "proc_identity_tests.rs"]
mod tests;
