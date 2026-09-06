//! A supervised JSON-RPC process. Dropping the client terminates its process tree.
use super::{process, process_io, process_kill, TurnCommand, TurnHandle};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::io::{BufReader, Write};
use std::process::{Child, ChildStdin};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

pub struct Client {
    child: Child,
    input: ChildStdin,
    output: Receiver<Result<Value, String>>,
    handle: TurnHandle,
    next_id: u64,
    pending: VecDeque<Value>,
    stderr: std::sync::Arc<parking_lot::Mutex<String>>,
}
impl Client {
    pub fn process_id(&self) -> u32 {
        self.child.id()
    }
    pub fn start(command: TurnCommand, handle: &TurnHandle) -> Result<Self, String> {
        if handle.cancelled() {
            return Err("Stopped by the user.".into());
        }
        let mut child = process::spawn(&command).map_err(|e| e.to_string())?;
        handle.attach(child.id());
        let input = child.stdin.take().ok_or("Provider stdin unavailable.")?;
        let stdout = child.stdout.take().ok_or("Provider stdout unavailable.")?;
        let stderr = child
            .stderr
            .take()
            .map(process_io::observe_stderr)
            .unwrap_or_default();
        let (send, output) = mpsc::sync_channel(8);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = Vec::new();
                match process_io::read_bounded(&mut reader, &mut line) {
                    Ok(0) => break,
                    Ok(size) if size <= process_io::MAX_LINE => {
                        let parsed = serde_json::from_slice(&line)
                            .map_err(|e| format!("Invalid provider event: {e}"));
                        if send.send(parsed).is_err() {
                            break;
                        }
                    }
                    Ok(_) => {
                        let _ = send.send(Err("Provider event exceeds 4 MiB.".into()));
                        break;
                    }
                    Err(error) => {
                        let _ = send.send(Err(error.to_string()));
                        break;
                    }
                }
            }
        });
        Ok(Self {
            child,
            input,
            output,
            handle: handle.clone(),
            next_id: 1,
            pending: VecDeque::new(),
            stderr,
        })
    }
    pub fn send(&mut self, value: Value) -> Result<(), String> {
        serde_json::to_writer(&mut self.input, &value).map_err(|e| e.to_string())?;
        self.input
            .write_all(b"\n")
            .and_then(|_| self.input.flush())
            .map_err(|e| e.to_string())
    }
    pub fn receive(&mut self) -> Result<Option<Value>, String> {
        if let Some(value) = self.pending.pop_front() {
            return Ok(Some(value));
        }
        self.receive_wire()
    }
    fn receive_wire(&self) -> Result<Option<Value>, String> {
        if self.handle.cancelled() {
            return Err("Stopped by the user.".into());
        }
        match self.output.recv_timeout(Duration::from_millis(100)) {
            Ok(value) => value.map(Some),
            Err(RecvTimeoutError::Timeout) => Ok(None),
            Err(RecvTimeoutError::Disconnected) => {
                let detail = self.stderr.lock();
                Err(if detail.trim().is_empty() {
                    "Provider closed before confirming the task outcome.".into()
                } else {
                    format!(
                        "Provider closed before confirming the task outcome: {}",
                        detail.trim()
                    )
                })
            }
        }
    }
    pub fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.request_with_timeout(method, params, Duration::from_secs(30))
    }
    pub fn request_with_timeout(
        &mut self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(json!({"id":id,"method":method,"params":params}))?;
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            let Some(value) = self.receive_wire()? else {
                continue;
            };
            if value.get("id").and_then(Value::as_u64) != Some(id) {
                if self.pending.len() >= 64 {
                    return Err("Provider sent too many events before its response.".into());
                }
                self.pending.push_back(value);
                continue;
            }
            if let Some(error) = value.get("error") {
                return Err(error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Provider request failed.")
                    .into());
            }
            return value
                .get("result")
                .cloned()
                .ok_or("Provider response has no result.".into());
        }
        Err(format!(
            "Provider did not answer {method} within {} seconds.",
            timeout.as_secs()
        ))
    }
}
impl Drop for Client {
    fn drop(&mut self) {
        process_kill::terminate_group(self.child.id());
        let _ = self.child.wait();
        self.handle.detach();
    }
}

#[cfg(test)]
#[path = "rpc_tests.rs"]
mod tests;
