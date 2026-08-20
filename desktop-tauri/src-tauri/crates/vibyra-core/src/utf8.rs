/// Length of the incomplete UTF-8 sequence at the end of `bytes`, if any.
///
/// PTY reads can cut a multi-byte character in half; the trailing fragment
/// must be carried into the next flush instead of being lossy-converted,
/// otherwise box-drawing characters and emoji from TUI agents get mangled.
pub fn incomplete_suffix_len(bytes: &[u8]) -> usize {
    let len = bytes.len();
    // A UTF-8 sequence is at most 4 bytes; scan back at most 3.
    let scan = len.min(3);
    for back in 1..=scan {
        let b = bytes[len - back];
        if b & 0b1100_0000 == 0b1000_0000 {
            continue; // continuation byte, keep scanning for the lead
        }
        let seq_len = if b & 0b1000_0000 == 0 {
            1
        } else if b & 0b1110_0000 == 0b1100_0000 {
            2
        } else if b & 0b1111_0000 == 0b1110_0000 {
            3
        } else if b & 0b1111_1000 == 0b1111_0000 {
            4
        } else {
            return 0; // invalid lead byte; let lossy conversion handle it
        };
        return if seq_len > back { back } else { 0 };
    }
    0
}

/// Drains `pending` up to the last complete UTF-8 boundary and returns the
/// decoded text; incomplete trailing bytes stay in `pending` for next time.
pub fn take_complete_utf8(pending: &mut Vec<u8>) -> String {
    let carry = incomplete_suffix_len(pending);
    let cut = pending.len() - carry;
    let chunk: Vec<u8> = pending.drain(..cut).collect();
    String::from_utf8_lossy(&chunk).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_ascii_has_no_carry() {
        assert_eq!(incomplete_suffix_len(b"hello"), 0);
    }

    #[test]
    fn split_emoji_is_carried() {
        let emoji = "🦀".as_bytes(); // 4 bytes
        let mut pending = b"ok".to_vec();
        pending.extend_from_slice(&emoji[..2]);
        assert_eq!(incomplete_suffix_len(&pending), 2);
        let text = take_complete_utf8(&mut pending);
        assert_eq!(text, "ok");
        pending.extend_from_slice(&emoji[2..]);
        assert_eq!(take_complete_utf8(&mut pending), "🦀");
    }

    #[test]
    fn complete_multibyte_is_not_carried() {
        let mut pending = "héllo".as_bytes().to_vec();
        assert_eq!(incomplete_suffix_len(&pending), 0);
        assert_eq!(take_complete_utf8(&mut pending), "héllo");
        assert!(pending.is_empty());
    }

    #[test]
    fn invalid_bytes_fall_through_to_lossy() {
        let mut pending = vec![b'a', 0xFF, b'b'];
        assert_eq!(incomplete_suffix_len(&pending), 0);
        assert_eq!(take_complete_utf8(&mut pending), "a\u{FFFD}b");
    }
}
