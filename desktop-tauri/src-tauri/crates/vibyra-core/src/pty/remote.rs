use crate::{ring::ByteRing, utf8::take_complete_utf8};

/// Independent, bounded UTF-8 stream. Desktop flushing never consumes phone data.
pub struct RemoteOutput {
    ring: ByteRing,
    incomplete: Vec<u8>,
    offset: u64,
}
impl RemoteOutput {
    pub fn new() -> Self {
        Self {
            ring: ByteRing::new(8000),
            incomplete: Vec::new(),
            offset: 0,
        }
    }
    pub fn push(&mut self, bytes: &[u8]) {
        self.incomplete.extend_from_slice(bytes);
        let text = take_complete_utf8(&mut self.incomplete);
        self.offset += text.len() as u64;
        self.ring.extend(text.as_bytes());
    }
    pub fn snapshot(&self) -> (String, u64, bool) {
        let bytes = self.ring.contents();
        let start = bytes
            .iter()
            .position(|b| b & 0xc0 != 0x80)
            .unwrap_or(bytes.len());
        (
            String::from_utf8_lossy(&bytes[start..]).into_owned(),
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
        stream.push("é".repeat(5001).as_bytes());
        let (tail, offset, truncated) = stream.snapshot();
        assert_eq!(offset, 10006);
        assert_eq!(tail.len(), 8000);
        assert!(truncated);
    }
}
