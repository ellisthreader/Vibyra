//! Match Codex panes by the rollout file their process holds open. Recency
//! cannot distinguish simultaneous chats in the same working directory.

#[cfg(any(target_os = "macos", test))]
use std::collections::{HashMap, HashSet};
#[cfg(any(target_os = "macos", test))]
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityRequest {
    pub id: u64,
    pub account_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIdentity {
    pub id: u64,
    pub session_id: Option<String>,
}

#[cfg(any(target_os = "macos", test))]
pub fn rollout_id(path: &Path, root: &Path) -> Option<String> {
    path.strip_prefix(root.join("sessions")).ok()?;
    let name = path.file_name()?.to_str()?;
    let stem = name.strip_prefix("rollout-")?.strip_suffix(".jsonl")?;
    let id = stem.get(stem.len().checked_sub(36)?..)?;
    crate::commands::terminal_args::validate_session_id(id).ok()?;
    Some(id.to_owned())
}

#[cfg(any(target_os = "macos", test))]
pub fn choose_identity(
    family: &[(u32, usize)],
    files: &HashMap<u32, Vec<String>>,
    root: &Path,
) -> Option<String> {
    for depth in 0..=3 {
        let ids: HashSet<_> = family
            .iter()
            .filter(|(_, d)| *d == depth)
            .flat_map(|(pid, _)| files.get(pid).into_iter().flatten())
            .filter_map(|path| rollout_id(Path::new(path), root))
            .collect();
        if ids.len() == 1 {
            return ids.into_iter().next();
        }
        if ids.len() > 1 {
            return None;
        }
    }
    None
}

#[cfg(target_os = "macos")]
pub fn identify(
    manager: &vibyra_core::pty::PtyManager,
    requests: &[IdentityRequest],
) -> Result<Vec<SessionIdentity>, String> {
    let sessions = manager.list();
    let registry = crate::provider_auth_registry::Registry::load();
    let targets: Vec<_> = requests
        .iter()
        .take(24)
        .filter_map(|request| {
            let session = sessions
                .iter()
                .find(|s| s.id == request.id && s.agent_id == "codex" && s.alive)?;
            let pid = manager.process_id(session.id).ok()??;
            let home = registry
                .home("codex", request.account_id.as_deref().unwrap_or("default"))
                .ok()?;
            Some((request.id, pid, home.credentials_dir()))
        })
        .collect();
    if targets.is_empty() {
        return Ok(Vec::new());
    }
    identify_targets(&targets)
}

#[cfg(target_os = "macos")]
fn identify_targets(
    targets: &[(u64, u32, std::path::PathBuf)],
) -> Result<Vec<SessionIdentity>, String> {
    use crate::session_process_files::{capture, open_files, process_family, process_parents};
    let parents = process_parents(&capture("/bin/ps", &["-axo", "pid=,ppid="])?);
    let families: Vec<_> = targets
        .iter()
        .map(|(_, pid, _)| process_family(*pid, &parents))
        .collect();
    let pids: HashSet<_> = families
        .iter()
        .flatten()
        .map(|(pid, _)| pid.to_string())
        .collect();
    let pids = pids.into_iter().collect::<Vec<_>>().join(",");
    let files = open_files(&capture(
        "/usr/sbin/lsof",
        &["-n", "-P", "-a", "-p", &pids, "-Fn"],
    )?);
    Ok(targets
        .iter()
        .zip(&families)
        .map(|((id, _, root), family)| SessionIdentity {
            id: *id,
            session_id: choose_identity(
                family,
                &files,
                &root.canonicalize().unwrap_or_else(|_| root.clone()),
            ),
        })
        .collect())
}

#[cfg(not(target_os = "macos"))]
pub fn identify(
    _: &vibyra_core::pty::PtyManager,
    requests: &[IdentityRequest],
) -> Result<Vec<SessionIdentity>, String> {
    // Other platforms use the provider's chooser when no exact ID is known.
    for request in requests {
        let _ = (request.id, &request.account_id);
    }
    Ok(Vec::new())
}

#[cfg(test)]
#[path = "session_identity_tests.rs"]
mod tests;
