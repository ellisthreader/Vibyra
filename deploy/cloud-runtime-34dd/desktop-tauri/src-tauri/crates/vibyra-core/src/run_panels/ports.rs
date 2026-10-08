//! The Ports section: TCP ports something on this computer is listening on,
//! read from `netstat` (never `lsof`, which can hang). Parsing is pure; which
//! of those belong to a project is decided by the caller from the owning
//! process's working folder (`owned_by`).

use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use regex::Regex;
use serde::Serialize;

const TIMEOUT: Duration = Duration::from_secs(5);
const MAX_OUTPUT: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listener {
    pub port: u16,
    /// The bound address, e.g. `127.0.0.1`, `*` or `::1`.
    pub address: String,
    pub pid: u32,
    pub process: String,
}

fn split_port(local: &str, separator: char) -> Option<(String, u16)> {
    let (address, port) = local.rsplit_once(separator)?;
    Some((
        address.trim_matches(|c| c == '[' || c == ']').to_owned(),
        port.parse().ok()?,
    ))
}

/// macOS `netstat -anv -p tcp`: `tcp4 0 0 127.0.0.1.3000 *.* LISTEN ... name:pid ...`.
pub fn parse_macos(output: &str) -> Vec<Listener> {
    let line = Regex::new(
        r"^tcp\S*\s+\d+\s+\d+\s+(\S+)\s+\S+\s+LISTEN\s+\d+\s+\d+\s+\d+\s+\d+\s+(.+?):(\d+)\s",
    )
    .unwrap();
    output
        .lines()
        .filter_map(|text| {
            let caps = line.captures(text)?;
            let (address, port) = split_port(&caps[1], '.')?;
            Some(Listener {
                port,
                address,
                pid: caps[3].parse().ok()?,
                process: caps[2].trim().to_owned(),
            })
        })
        .collect()
}

/// Linux `netstat -tlnp`: `tcp 0 0 0.0.0.0:3000 0.0.0.0:* LISTEN 1234/node`.
/// Sockets of other users show `-` for the owner and are skipped.
pub fn parse_linux(output: &str) -> Vec<Listener> {
    let line =
        Regex::new(r"^tcp\S*\s+\d+\s+\d+\s+(\S+)\s+\S+\s+LISTEN\s+(\d+)/(\S.*?)\s*$").unwrap();
    output
        .lines()
        .filter_map(|text| {
            let caps = line.captures(text)?;
            let (address, port) = split_port(&caps[1], ':')?;
            Some(Listener {
                port,
                address,
                pid: caps[2].parse().ok()?,
                process: caps[3].to_owned(),
            })
        })
        .collect()
}

/// Windows `netstat -ano -p TCP`: `TCP [::]:3000 [::]:0 LISTENING 4321`.
/// The process name is filled in by the caller from the pid.
pub fn parse_windows(output: &str) -> Vec<Listener> {
    let line = Regex::new(r"^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$").unwrap();
    output
        .lines()
        .filter_map(|text| {
            let caps = line.captures(text)?;
            let (address, port) = split_port(&caps[1], ':')?;
            Some(Listener {
                port,
                address,
                pid: caps[2].parse().ok()?,
                process: String::new(),
            })
        })
        .collect()
}

/// Whether a process working in `cwd` belongs to the project at `root`:
/// the same folder or anywhere beneath it, compared by whole path components.
pub fn owned_by(root: &Path, cwd: &Path) -> bool {
    cwd.starts_with(root)
}

/// One listener per (port, pid): dual-stack sockets list twice.
pub fn dedupe(mut found: Vec<Listener>) -> Vec<Listener> {
    found.sort_by(|a, b| (a.port, a.pid, &a.address).cmp(&(b.port, b.pid, &b.address)));
    found.dedup_by(|a, b| a.port == b.port && a.pid == b.pid);
    found
}

fn netstat_args() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &["-anv", "-p", "tcp"]
    } else if cfg!(windows) {
        &["-ano", "-p", "TCP"]
    } else {
        &["-tlnp"]
    }
}

/// Runs `netstat` with a time and size bound and parses its output.
pub fn read_listeners() -> Result<Vec<Listener>, String> {
    let mut command = Command::new("netstat");
    command
        .args(netstat_args())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    crate::launch_env::sanitize_command(&mut command);
    let mut child = command.spawn().map_err(|_| {
        "netstat is not installed on this computer, so ports cannot be listed.".to_string()
    })?;
    let stdout = child.stdout.take().ok_or("netstat gave no output.")?;
    let reader = std::thread::spawn(move || {
        use std::io::Read;
        let mut bytes = Vec::new();
        let _ = stdout.take(MAX_OUTPUT as u64).read_to_end(&mut bytes);
        bytes
    });
    let began = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if began.elapsed() < TIMEOUT => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("netstat took too long to answer.".into());
            }
        }
    }
    let text = String::from_utf8_lossy(&reader.join().unwrap_or_default()).into_owned();
    Ok(dedupe(if cfg!(target_os = "macos") {
        parse_macos(&text)
    } else if cfg!(windows) {
        parse_windows(&text)
    } else {
        parse_linux(&text)
    }))
}

#[cfg(test)]
#[path = "ports_tests.rs"]
mod tests;
