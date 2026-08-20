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
        let (a, b) = self.buf.as_slices();
        let mut out = Vec::with_capacity(a.len() + b.len());
        out.extend_from_slice(a);
        out.extend_from_slice(b);
        out
    }

    /// Decodes the retained bytes, reusing the copied buffer's allocation
    /// whenever the scrollback is valid UTF-8 — which it almost always is.
    ///
    /// `String::from_utf8_lossy(&ring.contents()).into_owned()` allocates and
    /// copies the whole ring a second time even on the valid path. Scrollback
    /// is capped at 4 MiB and decoded while the session lock is held, so that
    /// second copy stalled the PTY reader thread for no reason.
    pub fn to_utf8(&self) -> String {
        match String::from_utf8(self.contents()) {
            Ok(text) => text,
            Err(error) => String::from_utf8_lossy(error.as_bytes()).into_owned(),
        }
    }

    pub fn clear(&mut self) {
        self.buf.clear();
        self.truncated = false;
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
    fn oversized_write_keeps_tail() {
        let mut ring = ByteRing::new(4);
        ring.extend(b"0123456789");
        assert_eq!(ring.contents(), b"6789");
        assert!(ring.truncated());
    }
}
