//! The Logs section: one bounded ring of dev-server output per project, fed by
//! polling the output the preview already keeps (`PreviewStatus::logs`, its
//! last 160 lines). Preview's own buffer is never touched; this ring only
//! remembers what scrolled past, so Copy and Clear have something to work on.

use std::collections::{HashMap, VecDeque};

use parking_lot::Mutex;
use serde::Serialize;

/// Lines kept per project; older ones fall off the front.
pub const RING_LINES: usize = 2000;
const MAX_PROJECTS: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub seq: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogBatch {
    /// Lines with `seq` greater than the caller's `since`.
    pub lines: Vec<LogLine>,
    /// The newest sequence number the ring has issued.
    pub seq: u64,
    /// The ring was cleared or trimmed past `since`: the caller starts over.
    pub reset: bool,
}

#[derive(Default)]
struct Ring {
    lines: VecDeque<LogLine>,
    next: u64,
    /// The last window seen per target: what has already been counted.
    seen: HashMap<String, Vec<String>>,
    /// Bumped by Clear so a poller with an old `since` knows to start over.
    epoch: u64,
}

/// New lines in `window` given the previous window of the same target: the
/// longest tail of `previous` that is also the head of `window` was already
/// counted. Identical repeated lines can undercount, never overcount.
pub fn fresh_lines<'a>(previous: &[String], window: &'a [String]) -> &'a [String] {
    let most = previous.len().min(window.len());
    for overlap in (1..=most).rev() {
        if previous[previous.len() - overlap..] == window[..overlap] {
            return &window[overlap..];
        }
    }
    window
}

impl Ring {
    fn ingest(&mut self, target: &str, window: &[String]) {
        let previous = self.seen.get(target).cloned().unwrap_or_default();
        for text in fresh_lines(&previous, window) {
            self.next += 1;
            self.lines.push_back(LogLine {
                seq: self.next,
                text: text.clone(),
            });
        }
        while self.lines.len() > RING_LINES {
            self.lines.pop_front();
        }
        self.seen.insert(target.to_owned(), window.to_vec());
    }
}

#[derive(Default)]
pub struct RunLogs {
    rings: Mutex<HashMap<String, Ring>>,
}

impl RunLogs {
    /// Adds each target's current window, then returns what is newer than `since`.
    pub fn poll(
        &self,
        project: &str,
        windows: &[(String, Vec<String>)],
        since: u64,
        epoch: u64,
    ) -> (LogBatch, u64) {
        let mut rings = self.rings.lock();
        if !rings.contains_key(project) && rings.len() >= MAX_PROJECTS {
            if let Some(oldest) = rings.keys().next().cloned() {
                rings.remove(&oldest);
            }
        }
        let ring = rings.entry(project.to_owned()).or_default();
        for (target, window) in windows {
            ring.ingest(target, window);
        }
        let first = ring.lines.front().map_or(ring.next + 1, |line| line.seq);
        let reset = epoch != ring.epoch || (since != 0 && since + 1 < first);
        let from = if reset { 0 } else { since };
        let lines = ring
            .lines
            .iter()
            .filter(|line| line.seq > from)
            .cloned()
            .collect();
        (
            LogBatch {
                lines,
                seq: ring.next,
                reset,
            },
            ring.epoch,
        )
    }

    /// Empties the ring. What preview still holds counts as read, so it does not come back.
    pub fn clear(&self, project: &str) {
        if let Some(ring) = self.rings.lock().get_mut(project) {
            ring.lines.clear();
            ring.epoch += 1;
        }
    }
}

#[cfg(test)]
#[path = "logs_tests.rs"]
mod tests;
