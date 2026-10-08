//! What a running provider CLI has said so far: the sign-in link, the code and
//! whatever it is waiting to be told. Ported from the Mac app's sign-in pane.
use super::{device_code, url::find_https_url};
use parking_lot::Mutex;
use std::{
    io::Read,
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

/// A trailing question only counts once the CLI has stopped typing; otherwise
/// the "visit:" that introduces a link reads as a question for a moment.
pub(super) const SETTLE: Duration = Duration::from_millis(400);
/// Enough recent output to recognise a question and quote a failure, and
/// little enough that a chatty CLI cannot grow it forever.
const TAIL_LIMIT: usize = 4_096;
const SCAN_LIMIT: usize = 16_384;

pub(super) struct ProcessOutput {
    url: String,
    tail: String,
    /// Bytes read, ever: a question is told from one already answered by
    /// whether anything has been said since.
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

    pub fn device_code(&self) -> String {
        device_code::from_output(&self.tail)
    }

    /// The question the CLI is waiting on, or empty when it is not waiting.
    pub fn prompt(&self) -> String {
        if self.read <= self.answered_at || self.touched.elapsed() < SETTLE {
            return String::new();
        }
        pending_prompt(&self.tail).unwrap_or_default().to_owned()
    }

    /// The first line that announces a failure, not the last line printed.
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

    /// The pending question has been answered; the reply box closes.
    pub fn mark_answered(&mut self) {
        self.answered_at = self.read;
    }

    pub fn push(&mut self, chunk: &str) {
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

/// Drains one of a login's streams until it ends. Reading continues past the
/// link: the question after it is the point of an interactive login, and a
/// reader that stops also stops draining a pipe the CLI is still writing to.
/// The link is scanned out of a buffer private to this stream so stdout and
/// stderr cannot splice one line through the middle of another.
pub(super) fn capture<R: Read + Send + 'static>(mut reader: R, state: Arc<Mutex<ProcessOutput>>) {
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
                let mut cut = SCAN_LIMIT / 2;
                while !scan.is_char_boundary(cut) {
                    cut += 1;
                }
                scan.drain(..cut);
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
/// answer. Provider CLIs end a prompt with `>`, `:` or `?` and then stop; a
/// line carrying a URL is not a question however it ends.
pub(super) fn pending_prompt(tail: &str) -> Option<&str> {
    let line = tail.rsplit('\n').next()?.trim_end();
    let ends_open = line.ends_with('>') || line.ends_with(':') || line.ends_with('?');
    (!line.is_empty() && line.chars().count() <= 160 && ends_open && !line.contains("://"))
        .then_some(line)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verbatim from `claude auth login --claudeai` over a pipe.
    const CLAUDE_LOGIN: &str = "Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true\nPaste code here if prompted > ";

    fn settled(text: &str) -> ProcessOutput {
        let mut output = ProcessOutput::default();
        output.push(text);
        thread::sleep(SETTLE + Duration::from_millis(60));
        output
    }

    #[test]
    fn the_question_a_pasted_code_login_ends_on_is_recognised_once() {
        assert_eq!(
            pending_prompt(CLAUDE_LOGIN),
            Some("Paste code here if prompted >")
        );
        assert_eq!(pending_prompt("visit: https://auth.example.test/x"), None);
        let mut output = settled(CLAUDE_LOGIN);
        assert_eq!(output.prompt(), "Paste code here if prompted >");
        output.mark_answered();
        assert_eq!(output.prompt(), "");
    }

    #[test]
    fn a_failure_is_quoted_from_the_line_that_explains_it() {
        let output = settled("warn x\nerror code EACCES\nsee /tmp/log\n");
        assert_eq!(output.failure_line(), "error code EACCES");
        assert_eq!(settled("Signing in\nGave up\n\n").failure_line(), "Gave up");
    }
}
