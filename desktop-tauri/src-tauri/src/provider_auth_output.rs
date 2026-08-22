use std::io::Read;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use crate::provider_auth_url::find_https_url;

/// A trailing question only counts once the CLI has stopped typing. Without
/// the pause, the "visit:" that introduces a sign-in URL reads as a question
/// for the moment between the colon and the link.
const SETTLE: Duration = Duration::from_millis(400);
/// Enough recent output to recognise a question and to quote a failure back
/// to the user, and little enough that a chatty CLI cannot grow it forever.
const TAIL_LIMIT: usize = 4_096;
/// A provider that never prints a link should not buffer its whole log.
const SCAN_LIMIT: usize = 16_384;

/// What a running provider CLI has said so far: the sign-in link it printed,
/// and whatever it is waiting to be told.
pub struct ProcessOutput {
    url: String,
    tail: String,
    /// Bytes read, ever. Monotonic, so a question can be told from the one
    /// already answered by whether anything has been said since.
    read: usize,
    answered_at: usize,
    touched: Instant,
}

impl Default for ProcessOutput {
    fn default() -> Self {
        Self {
            url: String::new(),
            tail: String::new(),
            read: 0,
            answered_at: 0,
            touched: Instant::now(),
        }
    }
}

impl ProcessOutput {
    pub fn url(&self) -> String {
        self.url.clone()
    }

    /// The question the CLI is waiting on, or empty when it is not waiting.
    pub fn prompt(&self) -> String {
        if self.read <= self.answered_at || self.touched.elapsed() < SETTLE {
            return String::new();
        }
        pending_prompt(&self.tail).unwrap_or_default().to_owned()
    }

    /// Why it went wrong, for quoting back to the user.
    ///
    /// The first line that announces a failure, not the last line printed:
    /// npm signs off with the path to its debug log, which says nothing about
    /// what actually happened three lines earlier.
    pub fn failure_line(&self) -> String {
        let lines: Vec<&str> = self
            .tail
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect();
        lines
            .iter()
            .find(|line| announces_failure(line))
            .or_else(|| lines.last())
            .map(|line| line.chars().take(200).collect())
            .unwrap_or_default()
    }

    /// Records that the pending question has been answered, so the reply box
    /// closes instead of re-asking until the CLI happens to say something.
    pub fn mark_answered(&mut self) {
        self.answered_at = self.read;
    }

    fn push(&mut self, chunk: &str) {
        self.read += chunk.len();
        self.touched = Instant::now();
        self.tail.push_str(chunk);
        while self.tail.len() > TAIL_LIMIT {
            let cut = self.tail.len() - TAIL_LIMIT;
            let cut = (cut..self.tail.len())
                .find(|index| self.tail.is_char_boundary(*index))
                .unwrap_or(self.tail.len());
            self.tail.drain(..cut);
        }
    }

    fn offer_url(&mut self, url: String) {
        if self.url.is_empty() {
            self.url = url;
        }
    }
}

/// Drains one of a login's streams until it ends.
///
/// Reading has to continue past the sign-in link: the question that follows it
/// is the whole point of an interactive login, and a reader that stops early
/// also stops draining a pipe the CLI is still writing to. The link is scanned
/// out of a buffer private to this stream so that a provider writing to both
/// stdout and stderr cannot splice one line through the middle of another.
pub fn capture<R: Read + Send + 'static>(mut reader: R, state: Arc<Mutex<ProcessOutput>>) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1_024];
        let mut scan = String::new();
        let mut found = false;
        while let Ok(read) = reader.read(&mut buffer) {
            if read == 0 {
                break;
            }
            let chunk = String::from_utf8_lossy(&buffer[..read]);
            state.lock().push(&chunk);
            if found {
                continue;
            }
            scan.push_str(&chunk);
            if let Some(url) = find_https_url(&scan, false) {
                state.lock().offer_url(url);
                found = true;
                scan = String::new();
            } else if scan.len() > SCAN_LIMIT {
                scan.drain(..SCAN_LIMIT / 2);
            }
        }
        if !found {
            if let Some(url) = find_https_url(&scan, true) {
                state.lock().offer_url(url);
            }
        }
    });
}

fn announces_failure(line: &str) -> bool {
    let lower = line.to_lowercase();
    ["error", "failed", "not found", "denied"]
        .iter()
        .any(|marker| lower.contains(marker))
}

/// The trailing line of `tail` when it reads as a question waiting on an
/// answer rather than a finished sentence.
///
/// Provider CLIs end a prompt with `>`, `:` or `?` and then stop, so the shape
/// is worth trusting; a line carrying a URL is not a question no matter how it
/// ends.
pub fn pending_prompt(tail: &str) -> Option<&str> {
    let line = tail.rsplit('\n').next()?.trim_end();
    let ends_open = line.ends_with('>') || line.ends_with(':') || line.ends_with('?');
    (!line.is_empty() && line.chars().count() <= 160 && ends_open && !line.contains("://"))
        .then_some(line)
}

#[cfg(test)]
#[path = "provider_auth_output_tests.rs"]
mod tests;
