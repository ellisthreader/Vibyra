//! Cheap sampling of WebKitGTK's renderer child on Linux.
//!
//! A terminal can saturate WebKit's single renderer core while total machine
//! CPU stays low. Reading `/proc/.../children` avoids a full process-table walk
//! on every performance poll and lets the frontend detect that condition.

use sysinfo::{Pid, System};

#[cfg(target_os = "linux")]
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, MINIMUM_CPU_UPDATE_INTERVAL};

#[cfg(target_os = "linux")]
fn process_kind() -> ProcessRefreshKind {
    ProcessRefreshKind::nothing()
        .with_cpu()
        .with_memory()
        .without_tasks()
}

#[cfg(target_os = "linux")]
fn parse_children(raw: &str) -> Vec<Pid> {
    raw.split_whitespace()
        .filter_map(|value| value.parse::<u32>().ok())
        .map(Pid::from_u32)
        .collect()
}

#[cfg(target_os = "linux")]
fn is_webkit_renderer(comm: &str) -> bool {
    // Linux truncates `comm` to 15 characters (`WebKitWebProces`).
    comm.trim().starts_with("WebKitWebProces")
}

#[cfg(target_os = "linux")]
fn renderer_children(parent: Pid) -> Vec<Pid> {
    let parent = parent.to_string();
    let children = std::path::Path::new("/proc")
        .join(&parent)
        .join("task")
        .join(&parent)
        .join("children");
    let Ok(raw) = std::fs::read_to_string(children) else {
        return Vec::new();
    };
    parse_children(&raw)
        .into_iter()
        .filter(|pid| {
            std::fs::read_to_string(format!("/proc/{pid}/comm"))
                .is_ok_and(|comm| is_webkit_renderer(&comm))
        })
        .collect()
}

/// Raw renderer-process CPU where 100 means one fully occupied core.
pub fn cpu_percent(system: &mut System, parent: Pid) -> Option<f32> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (system, parent);
        None
    }
    #[cfg(target_os = "linux")]
    {
        let pids = renderer_children(parent);
        if pids.is_empty() {
            return None;
        }
        let needs_prime = pids.iter().any(|pid| system.process(*pid).is_none());
        system.refresh_processes_specifics(ProcessesToUpdate::Some(&pids), true, process_kind());
        if needs_prime {
            std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
            system.refresh_processes_specifics(
                ProcessesToUpdate::Some(&pids),
                true,
                process_kind(),
            );
        }
        let cpu = pids
            .iter()
            .filter_map(|pid| system.process(*pid))
            .map(|process| process.cpu_usage())
            .sum::<f32>();
        Some(cpu.clamp(0.0, 100.0))
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn parses_proc_children_without_accepting_noise() {
        let pids = parse_children("12 34 nope 56\n");
        assert_eq!(
            pids.iter().map(|pid| pid.as_u32()).collect::<Vec<_>>(),
            [12, 34, 56]
        );
    }

    #[test]
    fn recognises_linux_truncated_renderer_name_only() {
        assert!(is_webkit_renderer("WebKitWebProces\n"));
        assert!(!is_webkit_renderer("WebKitNetworkPr\n"));
    }
}
