//! Every bound in one place, so tests can shrink them and the rules stay visible.

use std::time::Duration;

pub const MAX_SERVERS: usize = 10;
pub const MAX_TOOLS: usize = 100;
/// Bytes of a tool result's text kept for the receipt (the backend caps it again).
pub const RESULT_TEXT_BYTES: usize = 16_000;

#[derive(Clone, Debug)]
pub struct Limits {
    /// A server nobody called for this long is stopped (started again on next use).
    pub idle_stop: Duration,
    pub default_call: Duration,
    pub max_call: Duration,
    /// The whole start: spawn, handshake and `npx`/`uvx` downloads.
    pub start_timeout: Duration,
    /// How long `server/discover` may stay unanswered before the legacy handshake.
    pub probe_timeout: Duration,
    /// One JSON-RPC line. Anything longer is dropped, never buffered.
    pub max_message: usize,
    /// Lines on stdout that are not JSON before the server is judged broken.
    pub max_noise_lines: usize,
    pub stderr_tail: usize,
    pub restart_backoff: Vec<Duration>,
    /// Failed starts or crashes in a row before the server is left `Failed`.
    pub max_failures: u32,
    pub stop_grace: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            idle_stop: Duration::from_secs(600),
            default_call: Duration::from_secs(60),
            max_call: Duration::from_secs(300),
            start_timeout: Duration::from_secs(60),
            probe_timeout: Duration::from_secs(5),
            max_message: 4 * 1024 * 1024,
            max_noise_lines: 200,
            stderr_tail: 4096,
            restart_backoff: [1, 2, 5, 15, 60].map(Duration::from_secs).to_vec(),
            max_failures: 5,
            stop_grace: Duration::from_millis(800),
        }
    }
}

impl Limits {
    /// A server's own time limit, clamped to `[1 s, max_call]`.
    pub fn call_timeout(&self, secs: Option<u64>) -> Duration {
        secs.map(Duration::from_secs)
            .unwrap_or(self.default_call)
            .clamp(Duration::from_secs(1), self.max_call)
    }

    pub fn backoff(&self, failures: u32) -> Duration {
        let index =
            (failures.max(1) as usize - 1).min(self.restart_backoff.len().saturating_sub(1));
        self.restart_backoff.get(index).copied().unwrap_or_default()
    }
}
