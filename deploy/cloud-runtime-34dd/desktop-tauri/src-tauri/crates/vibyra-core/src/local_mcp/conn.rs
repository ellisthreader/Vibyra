//! One running server process and the JSON-RPC conversation with it. A
//! connection is used by one caller at a time (the supervisor's per-server lock).

use super::error::McpError;
use super::limits::Limits;
use super::redact::{redact, tail};
use super::rpc::{decline, outcome, with_meta};
use super::spec::ServerSpec;
use super::wire::{drain_tail, read_lines, Incoming, Tail};
use serde_json::{json, Value};
use std::io::Write;
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub use super::rpc::Era;

pub struct Conn {
    child: Child,
    stdin: Option<ChildStdin>,
    rx: Receiver<Incoming>,
    stderr: Tail,
    next_id: u64,
    pub era: Era,
    pub limits: Limits,
    secrets: Vec<String>,
    noise: usize,
    pub last_noise: Option<String>,
}

impl Conn {
    pub fn spawn(
        program: &Path,
        spec: &ServerSpec,
        env: Vec<(String, String)>,
        limits: Limits,
        secrets: Vec<String>,
    ) -> Result<Self, McpError> {
        let mut command = Command::new(program);
        command.args(&spec.args).env_clear().envs(env);
        if let Some(cwd) = &spec.cwd {
            command.current_dir(cwd);
        }
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        crate::process_group::isolate(&mut command);
        let mut child = command.spawn().map_err(|e| {
            McpError::Spawn(redact(
                &format!("The server could not start: {e}"),
                &secrets,
            ))
        })?;
        let (sender, rx) = mpsc::channel();
        let (stdout, stderr_pipe) = (child.stdout.take(), child.stderr.take());
        let (Some(stdout), Some(stderr_pipe)) = (stdout, stderr_pipe) else {
            crate::process_group::stop(&mut child, limits.stop_grace);
            return Err(McpError::Spawn("The server has no output.".into()));
        };
        let cap = limits.max_message;
        std::thread::spawn(move || read_lines(stdout, cap, sender));
        let stderr: Tail = Arc::new(Mutex::new(String::new()));
        let (into, keep) = (stderr.clone(), limits.stderr_tail);
        std::thread::spawn(move || drain_tail(stderr_pipe, keep, into));
        Ok(Self {
            stdin: child.stdin.take(),
            child,
            rx,
            stderr,
            next_id: 1,
            era: Era::Pending,
            limits,
            secrets,
            noise: 0,
            last_noise: None,
        })
    }

    /// `text` with every secret value hidden.
    pub fn hide(&self, text: &str) -> String {
        redact(text, &self.secrets)
    }

    /// The end of the server's stderr with every secret value hidden.
    pub fn stderr_tail(&self) -> String {
        let text = self.stderr.lock().map(|t| t.clone()).unwrap_or_default();
        redact(tail(text.trim(), 600), &self.secrets)
    }

    pub fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub fn write(&mut self, value: &Value) -> Result<(), McpError> {
        let line = format!("{value}\n");
        let sent = self.stdin.as_mut().is_some_and(|stdin| {
            stdin
                .write_all(line.as_bytes())
                .and_then(|_| stdin.flush())
                .is_ok()
        });
        sent.then_some(()).ok_or_else(|| self.closed())
    }

    pub fn closed(&self) -> McpError {
        McpError::Crashed(self.stderr_tail())
    }

    pub fn notify(&mut self, method: &str, params: Value) {
        let _ = self.write(&json!({"jsonrpc": "2.0", "method": method, "params": params}));
    }

    /// Sends a request and returns its id without waiting.
    pub fn send(&mut self, method: &str, mut params: Value) -> Result<u64, McpError> {
        let id = self.next_id;
        self.next_id += 1;
        if let Era::Modern(version) = &self.era {
            params = with_meta(version, params);
        }
        self.write(&json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}))?;
        Ok(id)
    }

    /// Waits for the response to one of `want`; `None` when `deadline` passes.
    /// Server-to-client requests are answered (ping) or declined, never ignored.
    pub fn wait(
        &mut self,
        want: &[u64],
        deadline: Instant,
    ) -> Result<Option<(u64, Value)>, McpError> {
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            let event = match self.rx.recv_timeout(left) {
                Ok(event) => event,
                Err(RecvTimeoutError::Timeout) => return Ok(None),
                Err(RecvTimeoutError::Disconnected) => Incoming::Closed,
            };
            match event {
                Incoming::Closed => return Err(self.closed()),
                Incoming::Oversized => return Err(McpError::TooLarge(self.limits.max_message)),
                Incoming::Noise(line) => {
                    self.noise += 1;
                    self.last_noise = Some(redact(&line, &self.secrets));
                    if self.noise > self.limits.max_noise_lines {
                        return Err(McpError::Handshake(
                            "The server writes text that is not MCP to its output.".into(),
                        ));
                    }
                }
                Incoming::Message(message) => {
                    if message.get("method").is_some() {
                        if message.get("id").is_some() {
                            let _ = self.write(&decline(&message));
                        }
                    } else if let Some(id) = message["id"].as_u64().filter(|id| want.contains(id)) {
                        return Ok(Some((id, message)));
                    }
                }
            }
        }
    }

    /// One request, one answer, within `timeout`. A silent server is told to
    /// cancel; the caller decides whether to stop it.
    pub fn request(
        &mut self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, McpError> {
        let id = self.send(method, params)?;
        match self.wait(&[id], Instant::now() + timeout)? {
            Some((_, message)) => outcome(&message).map_err(|e| e.redacted(&self.secrets)),
            None => {
                self.notify(
                    "notifications/cancelled",
                    json!({"requestId": id, "reason": "timeout"}),
                );
                Err(McpError::Timeout(timeout))
            }
        }
    }

    /// Closes input, then TERM and KILL to the whole group, and reaps.
    pub fn stop(&mut self) {
        self.stdin = None;
        crate::process_group::stop(&mut self.child, self.limits.stop_grace);
    }
}

impl Drop for Conn {
    fn drop(&mut self) {
        self.stop();
    }
}
