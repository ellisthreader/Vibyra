use std::collections::VecDeque;
use std::net::TcpListener;
use std::process::Child;
use std::sync::Arc;

use parking_lot::Mutex;

use crate::CoreResult;

pub(crate) use super::process_kill::{terminate, TreeGuard};
pub(crate) use super::process_spawn::spawn_process;
use super::types::ProcessSpec;

pub(crate) type LogBuffer = Arc<Mutex<Logs>>;

/// The last 160 lines, plus how many were ever written, so a desktop build that
/// keeps printing is told apart from one that has stalled.
#[derive(Default)]
pub(crate) struct Logs {
    lines: VecDeque<String>,
    total: u64,
}

pub(crate) struct ManagedChild {
    pub label: String,
    pub child: Child,
    pub port: u16,
    /// Holds the whole tree on Windows, where a process group cannot; on
    /// Unix the group does that and the guard is empty.
    #[cfg_attr(not(windows), allow(dead_code))]
    pub tree: TreeGuard,
}
pub(crate) fn new_logs() -> LogBuffer {
    Arc::new(Mutex::new(Logs {
        lines: VecDeque::with_capacity(160),
        total: 0,
    }))
}
pub(crate) fn push_log(logs: &LogBuffer, line: impl Into<String>) {
    let mut logs = logs.lock();
    let line = line.into();
    logs.lines.push_back(if line.chars().count() > 1000 {
        format!("{}…", line.chars().take(1000).collect::<String>())
    } else {
        line
    });
    logs.total += 1;
    while logs.lines.len() > 160 {
        logs.lines.pop_front();
    }
}
pub(crate) fn snapshot_logs(logs: &LogBuffer) -> Vec<String> {
    logs.lock().lines.iter().cloned().collect()
}
pub(crate) fn log_total(logs: &LogBuffer) -> u64 {
    logs.lock().total
}

pub(crate) struct PortReservation {
    listener: TcpListener,
    pub(crate) port: u16,
}

impl PortReservation {
    pub(crate) fn release(self) -> u16 {
        let Self { listener, port } = self;
        drop(listener);
        port
    }
}

pub(crate) fn reserve_port() -> CoreResult<PortReservation> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    Ok(PortReservation { listener, port })
}

pub(crate) fn preview_command(spec: &ProcessSpec) -> String {
    spec.env
        .iter()
        .map(|(key, value)| format!("{key}={}", preview_value(value)))
        .chain(std::iter::once(spec.program.clone()))
        .chain(spec.args.iter().map(|arg| preview_value(arg)))
        .collect::<Vec<_>>()
        .join(" ")
}

fn preview_value(value: &str) -> String {
    value.replace("{port}", "<available>")
}
