use std::path::{Path, PathBuf};

/// A saved port approval is not evidence that this project still runs that port.
/// Keep authorization separate; this check controls only the phone's live listing.
pub(in super::super) fn running_for_root(
    projects: &[(String, PathBuf)],
    root: &Path,
    port: u16,
) -> bool {
    let roots = projects
        .iter()
        .filter_map(|(id, path)| path.canonicalize().ok().map(|path| (id.clone(), path)))
        .collect::<Vec<_>>();
    let listeners = super::system::listeners(std::time::Duration::from_millis(2000));
    let pids = listeners
        .into_iter()
        .flatten()
        .filter(|listener| listener.port == port && !listener.ipv6)
        .map(|listener| listener.pid)
        .collect::<Vec<_>>();
    if pids.is_empty() || pids.len() > 256 {
        return false;
    }
    super::system::cwds(&pids)
        .values()
        .any(|cwd| super::owner(&roots, cwd).is_some_and(|(_, _, serving)| serving == root))
}
