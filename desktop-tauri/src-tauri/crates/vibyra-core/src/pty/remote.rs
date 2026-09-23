use crate::ring::{decode, ByteRing};
use crate::utf8::{incomplete_suffix_len, take_complete_utf8};

/// How much output a phone can replay when it opens or reconnects to a session.
///
/// This has to hold more than one repaint. A full-screen agent redrawing a
/// ~158-column pane in truecolor emits 13-27 KiB per frame, and a single PTY
/// read is already up to 16 KiB, so a smaller window guarantees two failures at
/// once: the snapshot starts partway through an escape sequence, which xterm
/// then prints as literal text, and the poll loop reports every tick as a
/// resync, which blanks the phone's screen several times a second. 256 KiB is
/// roughly ten frames of headroom, against the 4 MiB the desktop already keeps
/// per session for its own scrollback.
const REPLAY_BYTES: usize = 256 * 1024;

/// A reader's position in a session's remote stream, answered by
/// [`RemoteOutput::since`].
#[derive(Debug, PartialEq, Eq)]
pub enum RemoteSince {
    /// Nothing was written after the offset asked about.
    Unchanged,
    /// Everything written after it, and the offset that output ends at.
    Output(String, u64),
    /// The offset has left the replay window, or was never a position in this
    /// stream: only a fresh snapshot catches the reader up. Carries the offset
    /// the stream has reached.
    Gap(u64),
}

/// Independent, bounded UTF-8 stream. Desktop flushing never consumes phone data.
pub struct RemoteOutput {
    ring: ByteRing,
    incomplete: Vec<u8>,
    offset: u64,
}
impl RemoteOutput {
    pub fn new() -> Self {
        Self {
            ring: ByteRing::new(REPLAY_BYTES),
            incomplete: Vec::new(),
            offset: 0,
        }
    }
    /// Runs on the reader thread for every PTY read. With no split character
    /// carried over — nearly every read — valid output goes straight into the
    /// ring instead of through a buffer copy and a decoded `String` first.
    pub fn push(&mut self, bytes: &[u8]) {
        if self.incomplete.is_empty() {
            let head = &bytes[..bytes.len() - incomplete_suffix_len(bytes)];
            if std::str::from_utf8(head).is_ok() {
                self.offset += head.len() as u64;
                self.ring.extend(head);
                self.incomplete.extend_from_slice(&bytes[head.len()..]);
                return;
            }
        }
        self.incomplete.extend_from_slice(bytes);
        let text = take_complete_utf8(&mut self.incomplete);
        self.offset += text.len() as u64;
        self.ring.extend(text.as_bytes());
    }
    pub fn offset(&self) -> u64 {
        self.offset
    }
    /// What was written after stream offset `from`, copying only those bytes.
    /// The same answer the snapshot gives a reader at `from`, without copying
    /// and decoding the whole replay window to find it.
    pub fn since(&self, from: u64) -> RemoteSince {
        if from == self.offset {
            return RemoteSince::Unchanged;
        }
        let ring_start = self.offset - self.ring.len() as u64;
        let first = ring_start + self.ring.leading_continuation_len() as u64;
        if from < first || from > self.offset {
            return RemoteSince::Gap(self.offset);
        }
        let bytes = self.ring.copy_from((from - ring_start) as usize);
        if bytes.first().is_some_and(|b| b & 0xc0 == 0x80) {
            return RemoteSince::Gap(self.offset);
        }
        RemoteSince::Output(decode(bytes), self.offset)
    }
    pub fn snapshot(&self) -> (String, u64, bool) {
        let start = self.ring.leading_continuation_len();
        (
            decode(self.ring.copy_from(start)),
            self.offset,
            self.ring.truncated(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn split_unicode_and_truncated_tail_have_exact_offsets() {
        let mut stream = RemoteOutput::new();
        stream.push(&[0xf0, 0x9f]);
        assert_eq!(stream.snapshot().1, 0);
        stream.push(&[0xa6, 0x80]);
        assert_eq!(stream.snapshot(), ("🦀".into(), 4, false));
        stream.push("é".repeat(REPLAY_BYTES).as_bytes());
        let (tail, offset, truncated) = stream.snapshot();
        assert_eq!(offset, 4 + REPLAY_BYTES as u64 * 2);
        assert_eq!(tail.len(), REPLAY_BYTES);
        assert!(truncated);
    }

    #[test]
    fn since_matches_what_the_snapshot_would_have_sent() {
        let mut stream = RemoteOutput::new();
        assert_eq!(stream.since(0), RemoteSince::Unchanged);
        stream.push("ab".as_bytes());
        stream.push(&[0xe2, 0x94]);
        assert_eq!(stream.since(2), RemoteSince::Unchanged);
        stream.push(&[0x80, b'c', 0xff]);
        assert_eq!(stream.offset(), 9);
        assert_eq!(stream.since(2), RemoteSince::Output("─c\u{FFFD}".into(), 9));
        assert_eq!(
            stream.since(0),
            RemoteSince::Output("ab─c\u{FFFD}".into(), 9)
        );
        assert_eq!(stream.since(3), RemoteSince::Gap(9));
        assert_eq!(stream.since(10), RemoteSince::Gap(9));
        stream.push("é".repeat(REPLAY_BYTES).as_bytes());
        let end = stream.offset();
        assert_eq!(stream.since(0), RemoteSince::Gap(end));
        let RemoteSince::Output(tail, reached) = stream.since(end - 4) else {
            panic!("expected output");
        };
        assert_eq!((tail.as_str(), reached), ("éé", end));
    }
}
