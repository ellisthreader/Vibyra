use std::time::{Duration, Instant};

use crate::ring::ByteRing;
use crate::utf8::take_complete_utf8;

use super::Visibility;

/// Per-session output state shared between the PTY reader thread (producer)
/// and the flusher thread (consumer). All access happens under the session's
/// mutex; both sides only hold it for memcpy-scale work.
pub struct SessionOutput {
    /// Bytes read from the PTY that have not been delivered to the UI yet.
    pending: Vec<u8>,
    /// True once `pending` overflowed its cap while hidden/hibernated, which
    /// means the UI must be resynced from the scrollback ring instead of
    /// receiving an incremental flush.
    overflowed: bool,
    /// Bounded retention of recent output for hibernation replay/reattach.
    scrollback: ByteRing,
    pub visibility: Visibility,
    pub last_flush: Instant,
    /// When the last chunk left for the renderer, until `painted` clears it.
    unpainted_since: Option<Instant>,
    /// Set by the first `painted`. Until then the renderer is taken to paint
    /// instantly, which keeps an older frontend — and every test sink that
    /// never reports — on the plain interval pacing.
    renderer_reports_paints: bool,
    pending_cap: usize,
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
            overflowed: false,
            scrollback: ByteRing::new(scrollback_cap),
            visibility: Visibility::Visible,
            last_flush: Instant::now(),
            unpainted_since: None,
            renderer_reports_paints: false,
            pending_cap: pending_cap.max(4096),
        }
    }

    /// Called by the reader thread for every PTY read.
    pub fn push(&mut self, bytes: &[u8]) {
        self.scrollback.extend(bytes);
        if self.pending.len() + bytes.len() > self.pending_cap {
            // Keep memory flat for unwatched noisy terminals; mark that the
            // incremental stream is broken so the next drain resyncs.
            self.pending.clear();
            self.overflowed = true;
        } else {
            self.pending.extend_from_slice(bytes);
        }
    }

    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty() || self.overflowed
    }

    /// Called by the flusher thread when this session is due for delivery.
    pub fn drain(&mut self) -> Drained {
        let now = Instant::now();
        self.last_flush = now;
        if self.overflowed {
            self.overflowed = false;
            self.pending.clear();
            self.unpainted_since = Some(now);
            return Drained::Resync(self.scrollback.to_utf8());
        }
        if self.pending.is_empty() {
            return Drained::Nothing;
        }
        let text = take_complete_utf8(&mut self.pending);
        if text.is_empty() {
            return Drained::Nothing;
        }
        self.unpainted_since = Some(now);
        Drained::Chunk(text)
    }

    /// The renderer has drawn the last delivery. The first call is also what
    /// tells the flusher this session's renderer reports at all.
    pub fn painted(&mut self) {
        self.renderer_reports_paints = true;
        self.unpainted_since = None;
    }

    /// How much longer the flusher should hold this session's next delivery
    /// for a paint report, or `None` when it may deliver now: nothing is
    /// unpainted, the renderer never reports, or the wait has hit `timeout`.
    pub fn renderer_busy_for(&self, timeout: Duration) -> Option<Duration> {
        if !self.renderer_reports_paints {
            return None;
        }
        timeout
            .checked_sub(self.unpainted_since?.elapsed())
            .filter(|remaining| !remaining.is_zero())
    }

    /// Full scrollback snapshot for (re)attaching a terminal view.
    pub fn snapshot(&self) -> String {
        self.scrollback.to_utf8()
    }

    /// Abandons the incremental stream and returns the full snapshot.
    /// Used when waking from hibernation: the frontend recreates its
    /// terminal from scratch, so replaying pending bytes on top of a
    /// snapshot would duplicate output.
    pub fn force_resync(&mut self) -> String {
        self.pending.clear();
        self.overflowed = false;
        let now = Instant::now();
        self.last_flush = now;
        self.unpainted_since = Some(now);
        self.snapshot()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drains_pushed_bytes_as_text() {
        let mut out = SessionOutput::new(4096, 4096);
        out.push(b"hello ");
        out.push(b"world");
        match out.drain() {
            Drained::Chunk(text) => assert_eq!(text, "hello world"),
            _ => panic!("expected chunk"),
        }
        assert!(matches!(out.drain(), Drained::Nothing));
    }

    #[test]
    fn overflow_switches_to_resync_with_scrollback_tail() {
        let mut out = SessionOutput::new(4096, 8);
        out.push(&vec![b'x'; 5000]);
        out.push(b"tail-end");
        match out.drain() {
            Drained::Resync(snapshot) => assert_eq!(snapshot, "tail-end"),
            _ => panic!("expected resync"),
        }
        assert!(matches!(out.drain(), Drained::Nothing));
    }

    #[test]
    fn a_renderer_that_never_reports_is_never_waited_for() {
        let mut out = SessionOutput::new(4096, 4096);
        out.push(b"abc");
        assert!(matches!(out.drain(), Drained::Chunk(_)));
        assert_eq!(out.renderer_busy_for(Duration::from_secs(1)), None);
    }

    #[test]
    fn waits_for_the_renderer_once_it_has_reported_and_gives_up_at_the_timeout() {
        let mut out = SessionOutput::new(4096, 4096);
        out.painted();
        out.push(b"abc");
        assert!(matches!(out.drain(), Drained::Chunk(_)));
        assert!(out.renderer_busy_for(Duration::from_secs(1)).is_some());
        assert_eq!(out.renderer_busy_for(Duration::ZERO), None);
        out.painted();
        assert_eq!(out.renderer_busy_for(Duration::from_secs(1)), None);
        // A wake from hibernation is a delivery too: the rebuilt view has to
        // draw the snapshot before it is handed more.
        out.force_resync();
        assert!(out.renderer_busy_for(Duration::from_secs(1)).is_some());
    }

    #[test]
    fn split_utf8_char_waits_for_completion() {
        let mut out = SessionOutput::new(4096, 4096);
        let bytes = "🦀".as_bytes();
        out.push(&bytes[..2]);
        assert!(matches!(out.drain(), Drained::Nothing));
        out.push(&bytes[2..]);
        match out.drain() {
            Drained::Chunk(text) => assert_eq!(text, "🦀"),
            _ => panic!("expected chunk"),
        }
    }
}
