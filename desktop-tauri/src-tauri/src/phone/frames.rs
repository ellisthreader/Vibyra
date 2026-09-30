use vibyra_host::MAX_PLAINTEXT;

/// How much terminal text one message to the phone may carry, counted the way
/// it travels: as JSON, where every ESC becomes the six bytes `\u001b`.
///
/// The encrypted channel takes at most `MAX_PLAINTEXT` (60 KiB) per message,
/// and an event that does not fit ends the phone's connection. The replay ring
/// holds 256 KiB, so once any terminal had printed more than one message's
/// worth, the first poll sent all of it as one event and every connection ended
/// straight after its handshake — the phone's "Connection interrupted" under
/// "Connecting securely". The ids and offsets around the text fit in the rest.
pub const TEXT_BUDGET: usize = MAX_PLAINTEXT - 4 * 1024;

/// Bytes `c` takes once serde_json has escaped it.
fn encoded(c: char) -> usize {
    match c {
        '"' | '\\' | '\u{8}' | '\t' | '\n' | '\u{c}' | '\r' => 2,
        c if c < ' ' => 6,
        c => c.len_utf8(),
    }
}

/// `text` in consecutive pieces that each fit one message, split only between
/// characters, so the pieces joined are exactly `text`.
pub fn pieces(text: &str) -> Vec<&str> {
    let mut pieces = Vec::new();
    let (mut start, mut size) = (0, 0);
    for (index, c) in text.char_indices() {
        let cost = encoded(c);
        if size + cost > TEXT_BUDGET {
            pieces.push(&text[start..index]);
            (start, size) = (index, 0);
        }
        size += cost;
    }
    if start < text.len() {
        pieces.push(&text[start..]);
    }
    pieces
}

/// The most recent part of `text` that fits one message.
pub fn tail(text: &str) -> &str {
    let mut size = 0;
    for (index, c) in text.char_indices().rev() {
        size += encoded(c);
        if size > TEXT_BUDGET {
            return &text[index + c.len_utf8()..];
        }
    }
    text
}
