use std::time::{Duration, Instant};

use crate::ring::ByteRing;
use crate::utf8::take_complete_utf8;

use super::Visibility;

/// The most scrollback a resync sends. The stream has already broken there,
/// and replaying the whole 4 MiB ring each time made a noisy pane's overflow
/// cost four times the output it lost.
const RESYNC_BYTES: usize = 1024 * 1024;

/// The longest a view's hold lasts without being renewed, so a release that
/// never arrives (a view torn down mid-flood) cannot freeze a pane.
const HOLD_LIMIT: Duration = Duration::from_secs(3);

/// Per-session output state shared between the PTY reader thread (producer)
/// and the flusher thread (consumer). All access happens under the session's
/// mutex; both sides only hold it for memcpy-scale work.
pub struct SessionOutput {
    /// Bytes read from the PTY that have not been delivered to the UI yet.
    pending: Vec<u8>,
    pub remote: super::remote::RemoteOutput,
    /// True once `pending` overflowed its cap while hidden/hibernated, which
    /// means the UI must be resynced from the scrollback ring instead of
    /// receiving an incremental flush.
    overflowed: bool,
    /// Bounded retention of recent output for hibernation replay/reattach.
    scrollback: ByteRing,
    pub visibility: Visibility,
    pub last_flush: Instant,
    pending_cap: usize,
    /// Set while the view is still parsing what it was already sent. Output
    /// waits here meanwhile — overflowing into one bounded resync, as for a
    /// hidden pane — instead of piling up unparsed in the webview.
    held_until: Option<Instant>,
}

pub enum Drained {
    Nothing,
    /// Incremental output to append to the terminal.
    Chunk(String),
    /// Pending overflowed while unwatched: the UI should reset the terminal
    /// and replace its contents with this scrollback snapshot.
    Resync(String),
}

impl SessionOutput {
    pub fn new(pending_cap: usize, scrollback_cap: usize) -> Self {
        Self {
            pending: Vec::new(),
            remote: super::remote::RemoteOutput::new(),
            overflowed: false,
            scrollback: ByteRing::new(scrollback_cap),
            visibility: Visibility::Visible,
            last_flush: Instant::now(),
            pending_cap: pending_cap.max(4096),
            held_until: None,
        }
    }

    /// Called by the reader thread for every PTY read. Returns whether the
    /// flusher should wake for it: a hidden pane waits for its interval
    /// unless it has just gone from idle to busy (so the flusher arms its
    /// timer) or is filling up, and a hibernated one never needs it.
    pub fn push(&mut self, bytes: &[u8]) -> bool {
        self.scrollback.extend(bytes);
        self.remote.push(bytes);
        // Waking from hibernation always resyncs from the ring and throws
        // `pending` away, and a stream that already overflowed will too.
        if self.visibility == Visibility::Hibernated || self.overflowed {
            return false;
        }
        let was_idle = self.pending.is_empty();
        if self.pending.len() + bytes.len() > self.pending_cap {
            // Keep memory flat for unwatched noisy terminals; mark that the
            // incremental stream is broken so the next drain resyncs.
            self.pending = Vec::new();
            self.overflowed = true;
        } else {
            self.pending.extend_from_slice(bytes);
        }
        !self.is_held() && (self.visibility == Visibility::Visible || was_idle || self.filling())
    }

    /// Holds output for a view that has fallen behind, or lets it flow again.
    pub fn hold(&mut self, hold: bool) {
        self.held_until = hold.then(|| Instant::now() + HOLD_LIMIT);
    }

    /// Whether a hold is in force; one that lapsed counts as released.
    pub fn is_held(&self) -> bool {
        self.held_until.is_some_and(|until| Instant::now() < until)
    }

    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty() || self.overflowed
    }

    /// Past half its cap, pending output is delivered without waiting out
    /// the hidden interval, before it overflows into a resync.
    fn filling(&self) -> bool {
        self.overflowed || self.pending.len() >= self.pending_cap / 2
    }

    /// Whether the flusher should drain this session now.
    pub fn due(&self, hidden_interval: Duration) -> bool {
        if self.is_held() {
            return false;
        }
        match self.visibility {
            Visibility::Visible => self.has_pending(),
            Visibility::Hidden => {
                self.has_pending()
                    && (self.filling() || self.last_flush.elapsed() >= hidden_interval)
            }
            Visibility::Hibernated => false,
        }
    }

    /// Called by the flusher thread when this session is due for delivery.
    pub fn drain(&mut self) -> Drained {
        self.last_flush = Instant::now();
        if self.overflowed {
            self.overflowed = false;
            self.pending = Vec::new();
            return Drained::Resync(self.scrollback.tail_utf8(RESYNC_BYTES));
        }
        if self.pending.is_empty() {
            return Drained::Nothing;
        }
        let text = take_complete_utf8(&mut self.pending);
        if text.is_empty() {
            Drained::Nothing
        } else {
            Drained::Chunk(text)
        }
    }

    /// Full scrollback snapshot for (re)attaching a terminal view.
    pub fn snapshot(&self) -> String {
        self.scrollback.to_utf8()
    }

    /// At most the last `max` bytes of scrollback, for readers that keep
    /// only the tail anyway.
    pub fn snapshot_tail(&self, max: usize) -> String {
        self.scrollback.tail_utf8(max)
    }

    /// Abandons the incremental stream and returns the full snapshot.
    /// Used when waking from hibernation: the frontend recreates its
    /// terminal from scratch, so replaying pending bytes on top of a
    /// snapshot would duplicate output.
    pub fn force_resync(&mut self) -> String {
        self.pending = Vec::new();
        self.overflowed = false;
        self.held_until = None;
        self.last_flush = Instant::now();
        self.snapshot()
    }
}
