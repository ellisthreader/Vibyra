//! Per-server runtime state: the process (if any), crash backoff, and the
//! small status the UI reads without waiting on a running call.

use super::conn::{Conn, Era};
use super::limits::Limits;
use super::spec::ServerSpec;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum State {
    Stopped,
    Starting,
    Running,
    /// Too many failures in a row; waits for a manual retry.
    Failed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub state: State,
    pub last_error: Option<String>,
    /// `modern` or `legacy`, and the negotiated version.
    pub era: Option<String>,
    pub protocol_version: Option<String>,
    pub failures: u32,
    pub started_at_ms: Option<u64>,
}

impl Default for Status {
    fn default() -> Self {
        Self {
            state: State::Stopped,
            last_error: None,
            era: None,
            protocol_version: None,
            failures: 0,
            started_at_ms: None,
        }
    }
}

#[derive(Default)]
pub struct Runtime {
    pub conn: Option<Conn>,
    pub fingerprint: String,
    pub failures: u32,
    pub next_start: Option<Instant>,
    pub last_used: Option<Instant>,
}

#[derive(Default)]
pub struct Slot {
    pub run: std::sync::Mutex<Runtime>,
    pub status: std::sync::Mutex<Status>,
}

impl Slot {
    pub fn set(&self, change: impl FnOnce(&mut Status)) {
        change(&mut self.status.lock().unwrap_or_else(|p| p.into_inner()));
    }

    pub fn snapshot(&self) -> Status {
        self.status
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn running(&self, era: &Era) {
        let (kind, version) = match era {
            Era::Modern(v) => ("modern", Some(v.clone())),
            Era::Legacy(v) => ("legacy", Some(v.clone())),
            Era::Pending => ("", None),
        };
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as u64);
        self.set(|s| {
            s.state = State::Running;
            s.era = (!kind.is_empty()).then(|| kind.to_owned());
            s.protocol_version = version;
            s.started_at_ms = Some(now);
        });
    }
}

impl Runtime {
    /// Stops the process and records why, with the backoff before the next start.
    pub fn fail(&mut self, slot: &Slot, limits: &Limits, why: String) {
        if let Some(mut conn) = self.conn.take() {
            conn.stop();
        }
        self.failures += 1;
        self.next_start = Some(Instant::now() + limits.backoff(self.failures));
        let failed = self.failures >= limits.max_failures;
        let failures = self.failures;
        slot.set(|s| {
            s.state = if failed {
                State::Failed
            } else {
                State::Stopped
            };
            s.last_error = Some(why);
            s.failures = failures;
        });
    }

    pub fn stop(&mut self, slot: &Slot) {
        if let Some(mut conn) = self.conn.take() {
            conn.stop();
        }
        slot.set(|s| {
            s.state = if s.state == State::Failed {
                State::Failed
            } else {
                State::Stopped
            }
        });
    }

    pub fn remaining_backoff(&self) -> Option<Duration> {
        self.next_start
            .and_then(|at| at.checked_duration_since(Instant::now()))
    }
}

/// Changes whenever the way the server is launched changes, so an edited
/// command, argument, folder or variable never keeps talking to the old process.
pub fn fingerprint(spec: &ServerSpec) -> String {
    let mut hash = Sha256::new();
    let parts = serde_json::json!([spec.command, spec.args, spec.cwd, spec.env, spec.secret_env]);
    hash.update(parts.to_string().as_bytes());
    hash.finalize()
        .iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect()
}
