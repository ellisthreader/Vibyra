//! Bounded, read-only inspection of a terminal's own processes on macOS.
//! No command lines, environment variables or transcript contents are collected.

use std::collections::HashMap;
#[cfg(target_os = "macos")]
use std::io::Read;
#[cfg(target_os = "macos")]
use std::process::{Command, Stdio};
#[cfg(target_os = "macos")]
use std::time::{Duration, Instant};

#[cfg(target_os = "macos")]
pub fn capture(program: &str, args: &[&str]) -> Result<String, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    let stdout = child.stdout.take().ok_or("No process output")?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        // lsof is constrained to this app's terminal process IDs.
        let _ = stdout.take(1024 * 1024).read_to_end(&mut bytes);
        String::from_utf8_lossy(&bytes).into_owned()
    });
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                return reader.join().map_err(|_| "Process reader stopped".into())
            }
            Ok(Some(_)) => {
                let _ = reader.join();
                return Err("Process inspection unavailable".into());
            }
            Ok(None) if start.elapsed() < Duration::from_secs(2) => {
                std::thread::sleep(Duration::from_millis(10))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err("Process inspection timed out".into());
            }
        }
    }
}

pub fn process_parents(raw: &str) -> HashMap<u32, u32> {
    raw.lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            Some((fields.next()?.parse().ok()?, fields.next()?.parse().ok()?))
        })
        .collect()
}

/// Closest process first. A Node launcher can own the native CLI as a child;
/// its agent-spawned subagents must never override the parent's conversation.
pub fn process_family(root: u32, parents: &HashMap<u32, u32>) -> Vec<(u32, usize)> {
    let mut family = vec![(root, 0)];
    for depth in 1..=3 {
        let children: Vec<_> = parents
            .iter()
            .filter_map(|(&pid, &parent)| {
                (family
                    .iter()
                    .any(|&(known, d)| known == parent && d == depth - 1)
                    && !family.iter().any(|&(known, _)| known == pid))
                .then_some((pid, depth))
            })
            .take(128_usize.saturating_sub(family.len()))
            .collect();
        family.extend(children);
    }
    family
}

pub fn open_files(raw: &str) -> HashMap<u32, Vec<String>> {
    let mut files: HashMap<u32, Vec<String>> = HashMap::new();
    let mut pid = None;
    for line in raw.lines() {
        if let Some(value) = line.strip_prefix('p') {
            pid = value.parse().ok();
        } else if let (Some(pid), Some(path)) = (pid, line.strip_prefix('n')) {
            files.entry(pid).or_default().push(path.to_owned());
        }
    }
    files
}
