//! One Claude Code process speaking stream-json on stdin/stdout. It leads its
//! own process group, so stopping it also stops the broker it started.

use super::claude_cmd::{command, Launch};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct Session {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: Receiver<String>,
    stderr: Arc<Mutex<String>>,
}

pub enum Next {
    Line(String),
    Idle,
    Closed,
}

impl Session {
    pub fn start(launch: &Launch) -> Result<Self, String> {
        let mut command = command(launch);
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        vibyra_core::process_group::isolate(&mut command);
        let mut child = command
            .spawn()
            .map_err(|error| format!("Claude Code could not start: {error}"))?;
        let stdout = child.stdout.take().ok_or("Claude Code has no output")?;
        let stderr_pipe = child
            .stderr
            .take()
            .ok_or("Claude Code has no error output")?;
        let (sender, lines) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        // Keep only the tail of stderr, for an error message; draining it
        // stops a chatty CLI from blocking on a full pipe.
        let stderr = Arc::new(Mutex::new(String::new()));
        let tail = stderr.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr_pipe);
            let mut chunk = [0u8; 4096];
            while let Ok(read) = reader.read(&mut chunk) {
                if read == 0 {
                    break;
                }
                let mut text = tail.lock().unwrap_or_else(|p| p.into_inner());
                text.push_str(&String::from_utf8_lossy(&chunk[..read]));
                if text.len() > 4096 {
                    let cut = text.len() - 2048;
                    let cut = (cut..text.len())
                        .find(|i| text.is_char_boundary(*i))
                        .unwrap_or(0);
                    text.drain(..cut);
                }
            }
        });
        Ok(Self {
            stdin: child.stdin.take(),
            child,
            lines,
            stderr,
        })
    }

    pub fn write(&mut self, value: &Value) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("Claude Code input is closed")?;
        writeln!(stdin, "{value}")
            .and_then(|_| stdin.flush())
            .map_err(|_| "Claude Code stopped reading input".to_string())
    }

    pub fn control(&mut self, id: &str, subtype: &str) -> Result<(), String> {
        self.write(
            &json!({"type": "control_request", "request_id": id, "request": {"subtype": subtype}}),
        )
    }

    /// The run's one user message: the prompt text, then `extra` content
    /// blocks (inline attachments, `attachments.rs`).
    pub fn send_user(&mut self, text: &str, extra: &[Value]) -> Result<(), String> {
        self.write(&user_message(text, extra))
    }

    /// Denies anything Claude asks the host (dontAsk should mean it never does).
    pub fn deny(&mut self, request_id: &str) -> Result<(), String> {
        self.write(
            &json!({"type": "control_response", "response": {"subtype": "error",
            "request_id": request_id, "error": "Vibyra Agent runs answer no permission prompts."}}),
        )
    }

    pub fn next(&self, wait: Duration) -> Next {
        match self.lines.recv_timeout(wait) {
            Ok(line) => Next::Line(line),
            Err(RecvTimeoutError::Timeout) => Next::Idle,
            Err(RecvTimeoutError::Disconnected) => Next::Closed,
        }
    }

    pub fn stderr_tail(&self) -> String {
        self.stderr
            .lock()
            .map(|t| t.trim().to_owned())
            .unwrap_or_default()
    }

    /// Closes input, then TERM → KILL to the whole process group.
    pub fn stop(&mut self, grace: Duration) {
        self.stdin = None;
        vibyra_core::process_group::stop(&mut self.child, grace);
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.stop(Duration::from_millis(500));
    }
}

/// A run without attachments sends exactly one text block, as it always did.
pub(super) fn user_message(text: &str, extra: &[Value]) -> Value {
    let mut content = vec![json!({"type": "text", "text": text})];
    content.extend_from_slice(extra);
    json!({"type": "user", "session_id": "",
        "message": {"role": "user", "content": content}, "parent_tool_use_id": null})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_attachments_is_the_single_text_message_it_always_was() {
        assert_eq!(
            user_message("hi", &[]),
            json!({"type": "user", "session_id": "",
                "message": {"role": "user", "content": [{"type": "text", "text": "hi"}]},
                "parent_tool_use_id": null})
        );
    }

    #[test]
    fn attachment_blocks_follow_the_prompt_text() {
        let image = json!({"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AA=="}});
        let message = user_message("hi", std::slice::from_ref(&image));
        let content = message["message"]["content"].as_array().unwrap();
        assert_eq!(content.len(), 2);
        assert_eq!(content[0]["text"], "hi");
        assert_eq!(content[1], image);
    }
}
