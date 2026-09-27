use std::collections::VecDeque;

/// Bounded byte buffer that drops its oldest bytes when full.
///
/// Used for terminal scrollback retention while a session is hidden or
/// hibernated, so memory stays flat no matter how noisy an agent is.
pub struct ByteRing {
    buf: VecDeque<u8>,
    cap: usize,
    truncated: bool,
}

impl ByteRing {
    pub fn new(cap: usize) -> Self {
        Self {
            buf: VecDeque::new(),
            cap: cap.max(1),
            truncated: false,
        }
    }

    pub fn extend(&mut self, bytes: &[u8]) {
        if bytes.len() >= self.cap {
            self.buf.clear();
            self.buf.extend(&bytes[bytes.len() - self.cap..]);
            self.truncated = true;
            return;
        }
        let overflow = (self.buf.len() + bytes.len()).saturating_sub(self.cap);
        if overflow > 0 {
            self.buf.drain(..overflow);
            self.truncated = true;
        }
        self.buf.extend(bytes);
    }

    pub fn len(&self) -> usize {
        self.buf.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buf.is_empty()
    }

    /// Whether any bytes have ever been dropped to stay within capacity.
    pub fn truncated(&self) -> bool {
        self.truncated
    }

    pub fn contents(&self) -> Vec<u8> {
        self.copy_from(0)
    }

    /// Copies the retained bytes from index `start` on, and nothing before it.
    pub fn copy_from(&self, start: usize) -> Vec<u8> {
        let (a, b) = self.buf.as_slices();
        let (a, b) = match a.get(start..) {
            Some(rest) => (rest, b),
            None => (&[][..], b.get(start - a.len()..).unwrap_or_default()),
        };
        let mut out = Vec::with_capacity(a.len() + b.len());
        out.extend_from_slice(a);
        out.extend_from_slice(b);
        out
    }

    /// How many bytes at the front continue a character the ring has already
    /// dropped the start of.
    pub fn leading_continuation_len(&self) -> usize {
        self.buf.iter().take_while(|b| *b & 0xc0 == 0x80).count()
    }

    /// Decodes the retained bytes, reusing the copied buffer's allocation
    /// whenever the scrollback is valid UTF-8 — which it almost always is.
    ///
    /// `String::from_utf8_lossy(&ring.contents()).into_owned()` allocates and
    /// copies the whole ring a second time even on the valid path. Scrollback
    /// is capped at 4 MiB and decoded while the session lock is held, so that
    /// second copy stalled the PTY reader thread for no reason.
    pub fn to_utf8(&self) -> String {
        decode(self.contents())
    }

    /// At most the last `max` bytes, decoded from the first character that
    /// starts inside them. A resync or a saved snapshot only needs the recent
    /// tail, and copying the whole 4 MiB ring under the session lock to throw
    /// most of it away stalled the reader for nothing.
    pub fn tail_utf8(&self, max: usize) -> String {
        let Some(mut start) = self.buf.len().checked_sub(max).filter(|start| *start > 0) else {
            return self.to_utf8();
        };
        // A character is at most four bytes, so the cut splits at most three.
        for _ in 0..3 {
            match self.buf.get(start) {
                Some(byte) if byte & 0xc0 == 0x80 => start += 1,
                _ => break,
            }
        }
        decode(self.copy_from(start))
    }

    pub fn clear(&mut self) {
        self.buf.clear();
        self.truncated = false;
    }
}

/// Takes the buffer as a `String` when it is valid UTF-8, which it almost
/// always is, and falls back to lossy decoding only when it is not.
pub fn decode(bytes: Vec<u8>) -> String {
    match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(error) => String::from_utf8_lossy(error.as_bytes()).into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_everything_under_capacity() {
        let mut ring = ByteRing::new(10);
        ring.extend(b"hello");
        assert_eq!(ring.contents(), b"hello");
        assert!(!ring.truncated());
    }

    #[test]
    fn drops_oldest_bytes_when_full() {
        let mut ring = ByteRing::new(5);
        ring.extend(b"abcde");
        ring.extend(b"fg");
        assert_eq!(ring.contents(), b"cdefg");
        assert!(ring.truncated());
    }

    #[test]
    fn decodes_wrapped_contents_and_replaces_invalid_bytes() {
        let mut ring = ByteRing::new(6);
        ring.extend("héllo".as_bytes());
        ring.extend(b"!");
        assert_eq!(ring.to_utf8(), "éllo!");

        let mut invalid = ByteRing::new(4);
        invalid.extend(&[b'a', 0xFF, b'b']);
        assert_eq!(invalid.to_utf8(), "a\u{FFFD}b");
    }

    #[test]
    fn tail_starts_on_a_character_and_copies_only_the_tail() {
        let mut ring = ByteRing::new(8);
        ring.extend("abcdé".as_bytes());
        ring.extend("fgh".as_bytes());
        // The ring wrapped: "bcdéfgh" is held across both halves of the deque.
        assert_eq!(ring.tail_utf8(64), ring.to_utf8());
        assert_eq!(ring.tail_utf8(5), "éfgh");
        assert_eq!(ring.tail_utf8(4), "fgh");
        assert_eq!(ring.copy_from(3), "éfgh".as_bytes());
        assert_eq!(ring.copy_from(99), b"");
        let whole = "x".repeat(300) + "yz";
        let mut long = ByteRing::new(1024);
        long.extend(whole.as_bytes());
        assert_eq!(long.tail_utf8(2), "yz");
        assert_eq!(long.leading_continuation_len(), 0);
    }

    #[test]
    fn oversized_write_keeps_tail() {
        let mut ring = ByteRing::new(4);
        ring.extend(b"0123456789");
        assert_eq!(ring.contents(), b"6789");
        assert!(ring.truncated());
    }
}
