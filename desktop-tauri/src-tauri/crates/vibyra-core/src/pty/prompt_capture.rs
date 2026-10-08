//! Remembers the first real request typed into an agent's terminal, so the pane
//! can be named after the work instead of after the program running it.
//!
//! Every input source — the Mac keyboard, voice, a phone — ends in
//! `Session::write_input`, so reading the bytes here sees all of them. This is
//! a best-effort reader, not a terminal: cursor-key editing is ignored, and a
//! line that only answers a prompt ("y", "2", "/help") is never a title.

/// Only the start of a request says what it is about; the rest is not kept.
const MAX_LINE_BYTES: usize = 2_000;
/// A first prompt shorter than this is an answer to a menu, not a task.
const MIN_PROMPT_CHARS: usize = 8;

const PASTE_START: &[u8] = b"\x1b[200~";
const PASTE_END: &[u8] = b"\x1b[201~";

#[derive(Debug, Default)]
pub struct PromptCapture {
    line: Vec<u8>,
    /// Bytes of an escape sequence still being read.
    escape: Vec<u8>,
    pasting: bool,
    first: Option<String>,
}

impl PromptCapture {
    /// The first submitted line that reads like a request, if one has been.
    pub fn first_prompt(&self) -> Option<&str> {
        self.first.as_deref()
    }

    pub fn feed(&mut self, data: &[u8]) {
        if self.first.is_some() {
            return;
        }
        for &byte in data {
            if !self.escape.is_empty() {
                self.escape.push(byte);
                self.finish_escape();
                continue;
            }
            match byte {
                0x1b => self.escape.push(byte),
                0x03 | 0x15 => self.line.clear(),
                0x7f | 0x08 => pop_char(&mut self.line),
                b'\r' | b'\n' if self.pasting => self.push(b' '),
                b'\r' | b'\n' => self.submit(),
                0x00..=0x1f => {}
                _ => self.push(byte),
            }
            if self.first.is_some() {
                return;
            }
        }
    }

    /// Reads one escape sequence byte by byte. Bracketed-paste markers switch
    /// paste mode; every other sequence (arrows, function keys, Alt+key) is
    /// dropped whole so its letters never land in the text.
    fn finish_escape(&mut self) {
        let seq = &self.escape;
        if PASTE_START.starts_with(seq) || PASTE_END.starts_with(seq) {
            if seq.as_slice() == PASTE_START {
                self.pasting = true;
            } else if seq.as_slice() == PASTE_END {
                self.pasting = false;
            } else {
                return;
            }
            self.escape.clear();
            return;
        }
        let done = match seq.as_slice() {
            [0x1b, b'['] | [0x1b, b'O'] => false,
            [0x1b, b'[', .., last] => (0x40..=0x7e).contains(last),
            _ => true,
        };
        if done || seq.len() > 16 {
            self.escape.clear();
        }
    }

    fn push(&mut self, byte: u8) {
        if self.line.len() < MAX_LINE_BYTES {
            self.line.push(byte);
        }
    }

    fn submit(&mut self) {
        let text = String::from_utf8_lossy(&std::mem::take(&mut self.line))
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if is_request(&text) {
            self.first = Some(text);
        }
    }
}

/// Removes the last whole character, not the last byte of it.
fn pop_char(line: &mut Vec<u8>) {
    while let Some(byte) = line.pop() {
        if byte & 0xc0 != 0x80 {
            break;
        }
    }
}

fn is_request(text: &str) -> bool {
    // One token is an answer ("yes", "2") or a pasted login code, not a task.
    if text.chars().count() < MIN_PROMPT_CHARS || !text.contains(' ') {
        return false;
    }
    // Slash commands, shell escapes and memory notes steer the CLI; they do
    // not say what the conversation is about.
    !text.starts_with(['/', '!', '#'])
}

#[cfg(test)]
#[path = "prompt_capture_tests.rs"]
mod tests;
