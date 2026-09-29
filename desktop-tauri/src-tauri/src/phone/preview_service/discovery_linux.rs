//! Linux TCP listeners from /proc/net, matched to processes through the
//! socket inodes in /proc/<pid>/fd (only this user's processes are readable).

use super::Listener;
use std::collections::HashMap;

/// A busy desktop has a few hundred processes; beyond this, stop looking.
const MAX_PROCESSES: usize = 4096;
const LISTEN: &str = "0A";

pub(super) fn listeners() -> Option<Vec<Listener>> {
    let mut sockets = HashMap::new();
    for (file, ipv6) in [("/proc/net/tcp", false), ("/proc/net/tcp6", true)] {
        let Ok(text) = std::fs::read_to_string(file) else {
            continue;
        };
        for line in text.lines().skip(1) {
            let fields = line.split_whitespace().collect::<Vec<_>>();
            if fields.len() < 10 || fields[3] != LISTEN {
                continue;
            }
            let Some((address, port)) = fields[1].split_once(':') else {
                continue;
            };
            let Ok(port) = u16::from_str_radix(port, 16) else {
                continue;
            };
            if port > 0 && loopback_reachable(address) {
                sockets.insert(fields[9].to_owned(), (port, ipv6));
            }
        }
    }
    if sockets.is_empty() {
        return Some(Vec::new());
    }
    let mut found = Vec::new();
    for entry in std::fs::read_dir("/proc")
        .ok()?
        .flatten()
        .take(MAX_PROCESSES)
    {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse::<u32>().ok())
        else {
            continue;
        };
        let Ok(fds) = std::fs::read_dir(entry.path().join("fd")) else {
            continue;
        };
        for fd in fds.flatten() {
            let Ok(link) = std::fs::read_link(fd.path()) else {
                continue;
            };
            let link = link.to_string_lossy();
            let inode = link
                .strip_prefix("socket:[")
                .and_then(|rest| rest.strip_suffix(']'));
            if let Some(&(port, ipv6)) = inode.and_then(|inode| sockets.get(inode)) {
                found.push(Listener { pid, port, ipv6 });
            }
        }
    }
    found.sort_unstable();
    found.dedup();
    Some(found)
}

/// Any-address and loopback listeners, as the phone's Mac-side proxy connects
/// over 127.0.0.1 or [::1]. /proc writes addresses as little-endian hex words.
fn loopback_reachable(address: &str) -> bool {
    matches!(
        address,
        "00000000"
            | "0100007F"
            | "00000000000000000000000000000000"
            | "00000000000000000000000001000000"
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn loopback_and_any_addresses_count_and_others_do_not() {
        assert!(super::loopback_reachable("0100007F"));
        assert!(super::loopback_reachable(
            "00000000000000000000000001000000"
        ));
        assert!(!super::loopback_reachable("0101A8C0"));
    }
}
