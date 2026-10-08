//! Newline-delimited JSON-RPC over a child's pipes, with hard bounds: a line
//! longer than the cap is discarded as it streams in (never buffered whole), and
//! stderr is drained into a short tail so a chatty server cannot block.

use super::redact::tail;
use serde_json::Value;
use std::io::Read;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

#[derive(Debug)]
pub enum Incoming {
    Message(Value),
    /// A line over the cap, dropped as it streamed in.
    Oversized,
    /// A line that is not a JSON object (a banner, a log line on stdout).
    Noise(String),
    /// End of output: the server exited or closed stdout.
    Closed,
}

pub type Tail = Arc<Mutex<String>>;

/// Reads `source` line by line until EOF, sending what it finds.
pub fn read_lines(mut source: impl Read, cap: usize, out: Sender<Incoming>) {
    let mut line: Vec<u8> = Vec::new();
    let mut skipped = 0usize;
    let mut chunk = [0u8; 8192];
    loop {
        let read = match source.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        for byte in &chunk[..read] {
            if *byte != b'\n' {
                if skipped > 0 {
                    skipped += 1;
                } else if line.len() >= cap {
                    skipped = line.len() + 1;
                    line.clear();
                } else {
                    line.push(*byte);
                }
                continue;
            }
            let event = if skipped > 0 {
                skipped = 0;
                Some(Incoming::Oversized)
            } else {
                classify(&line)
            };
            line.clear();
            if let Some(event) = event {
                if out.send(event).is_err() {
                    return;
                }
            }
        }
    }
    let _ = out.send(Incoming::Closed);
}

fn classify(line: &[u8]) -> Option<Incoming> {
    let text = String::from_utf8_lossy(line);
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    match serde_json::from_str::<Value>(text) {
        Ok(value) if value.is_object() => Some(Incoming::Message(value)),
        _ => Some(Incoming::Noise(super::redact::head(text, 120).to_owned())),
    }
}

/// Keeps only the end of what a stream writes, for an error message.
pub fn drain_tail(mut source: impl Read, keep: usize, into: Tail) {
    let mut chunk = [0u8; 4096];
    while let Ok(read) = source.read(&mut chunk) {
        if read == 0 {
            break;
        }
        let mut text = into.lock().unwrap_or_else(|p| p.into_inner());
        text.push_str(&String::from_utf8_lossy(&chunk[..read]));
        if text.len() > keep * 2 {
            let kept = tail(&text, keep).to_owned();
            *text = kept;
        }
    }
}
