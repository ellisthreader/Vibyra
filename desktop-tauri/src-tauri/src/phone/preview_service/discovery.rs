//! Bounded Mac-only discovery of HTTP sites owned by an open project folder.
//! Inspect listener PIDs and their cwd, never process arguments or terminal text.
use std::path::PathBuf;

#[cfg(any(test, target_os = "macos"))]
#[path = "discovery_probe.rs"]
mod probe;
#[cfg(all(test, not(target_os = "macos")))]
use probe::listener_port;
#[cfg(target_os = "macos")]
use probe::{listener_port, probe};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct DetectedServer {
    pub project_id: String,
    pub root: PathBuf,
    pub pid: u32,
    pub started_at: i64,
    pub port: u16,
    pub start_path: String,
}

#[cfg(target_os = "macos")]
pub(super) fn running(projects: &[(String, PathBuf)]) -> Vec<DetectedServer> {
    use crate::session_process_files::{capture_with_timeout as capture_bounded, open_files};
    use chrono::NaiveDateTime;
    use std::collections::{HashMap, HashSet};
    use std::time::Duration;

    let capture =
        |program, args: &[&str]| capture_bounded(program, args, Duration::from_millis(500));

    let roots = projects
        .iter()
        .filter_map(|(id, root)| root.canonicalize().ok().map(|path| (id.clone(), path)))
        .collect::<Vec<_>>();
    if roots.is_empty() {
        return Vec::new();
    }
    let Ok(raw) = capture(
        "/usr/sbin/lsof",
        &["-n", "-P", "-iTCP", "-sTCP:LISTEN", "-Fpn"],
    ) else {
        return Vec::new();
    };
    let listeners = open_files(&raw)
        .into_iter()
        .flat_map(|(pid, names)| {
            names
                .into_iter()
                .filter_map(move |name| listener_port(&name).map(|port| (pid, port)))
        })
        .collect::<Vec<_>>();
    let pids = listeners
        .iter()
        .map(|(pid, _)| *pid)
        .collect::<HashSet<_>>();
    if pids.is_empty() || pids.len() > 64 {
        return Vec::new();
    }
    let ids = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let Ok(cwd) = capture(
        "/usr/sbin/lsof",
        &["-n", "-P", "-a", "-p", &ids, "-d", "cwd", "-Fn"],
    ) else {
        return Vec::new();
    };
    let workdirs = open_files(&cwd);
    let started = capture("/bin/ps", &["-p", &ids, "-o", "pid=,lstart="])
        .ok()
        .map(|raw| {
            raw.lines()
                .filter_map(|line| {
                    let (pid, date) = line.trim().split_once(char::is_whitespace)?;
                    let date =
                        NaiveDateTime::parse_from_str(date.trim(), "%a %b %e %H:%M:%S %Y").ok()?;
                    Some((pid.parse::<u32>().ok()?, date.and_utc().timestamp()))
                })
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();
    let mut candidates = listeners
        .into_iter()
        .filter_map(|(pid, port)| {
            let cwd = PathBuf::from(workdirs.get(&pid)?.first()?)
                .canonicalize()
                .ok()?;
            let (project_id, root) = roots
                .iter()
                .filter(|(_, root)| cwd.starts_with(root))
                .max_by_key(|(_, root)| root.components().count())?;
            let started_at = *started.get(&pid)?;
            Some((
                started_at,
                DetectedServer {
                    project_id: project_id.clone(),
                    root: root.clone(),
                    pid,
                    started_at,
                    port,
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
                let port = candidate.port;
                scope.spawn(move || probe(port))
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

#[cfg(not(target_os = "macos"))]
pub(super) fn running(_: &[(String, PathBuf)]) -> Vec<DetectedServer> {
    Vec::new()
}

#[cfg(target_os = "macos")]
pub(super) fn owns(server: &DetectedServer) -> bool {
    use crate::session_process_files::{capture_with_timeout as capture_bounded, open_files};
    use chrono::NaiveDateTime;
    use std::time::Duration;
    let capture =
        |program, args: &[&str]| capture_bounded(program, args, Duration::from_millis(500));
    let pid = server.pid.to_string();
    let Ok(start) = capture("/bin/ps", &["-p", &pid, "-o", "lstart="]) else {
        return false;
    };
    let started = NaiveDateTime::parse_from_str(start.trim(), "%a %b %e %H:%M:%S %Y")
        .ok()
        .map(|date| date.and_utc().timestamp());
    if started != Some(server.started_at) {
        return false;
    }
    let port = format!("-iTCP:{}", server.port);
    let Ok(listeners) = capture(
        "/usr/sbin/lsof",
        &["-n", "-P", "-a", "-p", &pid, &port, "-sTCP:LISTEN", "-Fn"],
    ) else {
        return false;
    };
    if !open_files(&listeners)
        .get(&server.pid)
        .is_some_and(|names| {
            names
                .iter()
                .any(|name| listener_port(name) == Some(server.port))
        })
    {
        return false;
    }
    let Ok(cwd) = capture(
        "/usr/sbin/lsof",
        &["-n", "-P", "-a", "-p", &pid, "-d", "cwd", "-Fn"],
    ) else {
        return false;
    };
    open_files(&cwd)
        .get(&server.pid)
        .and_then(|names| names.first())
        .and_then(|name| PathBuf::from(name).canonicalize().ok())
        .is_some_and(|path| path.starts_with(&server.root))
}

#[cfg(not(target_os = "macos"))]
pub(super) fn owns(_: &DetectedServer) -> bool {
    false
}

#[cfg(test)]
#[path = "discovery_tests.rs"]
mod tests;
