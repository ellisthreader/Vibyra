//! What the operating system says about local sites: TCP listeners with their
//! process, and those processes' working folders and start times. macOS asks
//! `lsof` and `ps`; Linux reads /proc; Windows asks the IP Helper API.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

#[cfg(target_os = "linux")]
#[path = "discovery_linux.rs"]
mod os;
#[cfg(windows)]
#[path = "discovery_windows.rs"]
mod os;

/// A listening TCP socket reachable over loopback.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(super) struct Listener {
    pub pid: u32,
    pub port: u16,
    pub ipv6: bool,
}

#[cfg(target_os = "macos")]
pub(super) fn listeners(timeout: Duration) -> Option<Vec<Listener>> {
    use crate::session_process_files::{capture_with_timeout, open_files};
    let raw = capture_with_timeout(
        "/usr/sbin/lsof",
        &["-n", "-P", "-iTCP", "-sTCP:LISTEN", "-Fpn"],
        timeout,
    )
    .ok()?;
    Some(
        open_files(&raw)
            .into_iter()
            .flat_map(|(pid, names)| {
                names.into_iter().filter_map(move |name| {
                    super::discovery::listener(&name).map(|(port, ipv6)| Listener {
                        pid,
                        port,
                        ipv6,
                    })
                })
            })
            .collect(),
    )
}

#[cfg(any(target_os = "linux", windows))]
pub(super) fn listeners(_timeout: Duration) -> Option<Vec<Listener>> {
    os::listeners()
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
pub(super) fn listeners(_timeout: Duration) -> Option<Vec<Listener>> {
    None
}

/// Canonical working folders of `pids`, where this user may read them.
pub(super) fn cwds(pids: &[u32]) -> HashMap<u32, PathBuf> {
    raw_cwds(pids)
        .into_iter()
        .filter_map(|(pid, path)| path.canonicalize().ok().map(|path| (pid, path)))
        .collect()
}

#[cfg(target_os = "macos")]
fn raw_cwds(pids: &[u32]) -> HashMap<u32, PathBuf> {
    use crate::session_process_files::{capture_with_timeout, open_files};
    if pids.is_empty() {
        return HashMap::new();
    }
    let ids = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let Ok(raw) = capture_with_timeout(
        "/usr/sbin/lsof",
        &["-n", "-P", "-a", "-p", &ids, "-d", "cwd", "-Fn"],
        Duration::from_millis(2000),
    ) else {
        return HashMap::new();
    };
    open_files(&raw)
        .into_iter()
        .filter_map(|(pid, names)| Some((pid, PathBuf::from(names.first()?))))
        .collect()
}

#[cfg(not(target_os = "macos"))]
fn raw_cwds(pids: &[u32]) -> HashMap<u32, PathBuf> {
    crate::process_table::cwds(pids)
}

/// Start times of `pids` in Unix seconds, to tell a process from a later one
/// that reused its pid.
#[cfg(target_os = "macos")]
pub(super) fn started(pids: &[u32]) -> HashMap<u32, i64> {
    use crate::session_process_files::capture_with_timeout;
    use chrono::NaiveDateTime;
    if pids.is_empty() {
        return HashMap::new();
    }
    let ids = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    capture_with_timeout(
        "/bin/ps",
        &["-p", &ids, "-o", "pid=,lstart="],
        Duration::from_millis(2000),
    )
    .ok()
    .map(|raw| {
        raw.lines()
            .filter_map(|line| {
                let (pid, date) = line.trim().split_once(char::is_whitespace)?;
                let date =
                    NaiveDateTime::parse_from_str(date.trim(), "%a %b %e %H:%M:%S %Y").ok()?;
                Some((pid.parse::<u32>().ok()?, date.and_utc().timestamp()))
            })
            .collect()
    })
    .unwrap_or_default()
}

#[cfg(not(target_os = "macos"))]
pub(super) fn started(pids: &[u32]) -> HashMap<u32, i64> {
    crate::process_table::starts(pids)
        .into_iter()
        .map(|(pid, start)| (pid, start as i64))
        .collect()
}
