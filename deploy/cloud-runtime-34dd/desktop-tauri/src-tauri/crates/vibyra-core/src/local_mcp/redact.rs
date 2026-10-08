//! Secret values must never reach a log, an error message or the UI: a server
//! that fails often prints the environment it was given.

pub const HIDDEN: &str = "[hidden]";

/// Replaces every secret value in `text`. Values shorter than 4 bytes are
/// still hidden: a short secret is no less secret, and over-hiding is harmless.
pub fn redact(text: &str, secrets: &[String]) -> String {
    let mut out = text.to_owned();
    for secret in secrets.iter().filter(|s| !s.is_empty()) {
        out = out.replace(secret.as_str(), HIDDEN);
    }
    out
}

/// The last `max` bytes of `text` on a character boundary.
pub fn tail(text: &str, max: usize) -> &str {
    if text.len() <= max {
        return text;
    }
    let mut cut = text.len() - max;
    while !text.is_char_boundary(cut) {
        cut += 1;
    }
    &text[cut..]
}

/// The first `max` bytes on a character boundary.
pub fn head(text: &str, max: usize) -> &str {
    if text.len() <= max {
        return text;
    }
    let mut cut = max;
    while !text.is_char_boundary(cut) {
        cut -= 1;
    }
    &text[..cut]
}
