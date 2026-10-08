//! The passes of `scan` and `redact`, in the order `SecretGuard.php` runs them.

use super::patterns::compiled;
use super::values::{accept, name_class, placeholder, random};
use regex::bytes::{Captures, Regex};

pub const MAX_BYTES: usize = 1_000_000;

/// Replaces each match with what `f` returns; `None` keeps the match as it was.
fn replace_with(
    re: &Regex,
    text: &[u8],
    mut f: impl FnMut(&Captures) -> Option<Vec<u8>>,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len());
    let mut last = 0;
    for caps in re.captures_iter(text) {
        let whole = caps.get(0).expect("group 0");
        out.extend_from_slice(&text[last..whole.start()]);
        match f(&caps) {
            Some(replacement) => out.extend_from_slice(&replacement),
            None => out.extend_from_slice(whole.as_bytes()),
        }
        last = whole.end();
    }
    out.extend_from_slice(&text[last..]);
    out
}

fn tag(kind: &str) -> Vec<u8> {
    format!("[redacted:{kind}]").into_bytes()
}

fn join(parts: &[&[u8]]) -> Vec<u8> {
    parts.concat()
}

/// Runs every pass; `kinds` collects what was found, in pass order.
pub(super) fn run(input: &str, kinds: &mut Vec<String>) -> String {
    let c = compiled();
    let cut = input.len() > MAX_BYTES;
    let mut text: Vec<u8> = input.as_bytes()[..input.len().min(MAX_BYTES)].to_vec();
    for (kind, re) in &c.tokens {
        text = replace_with(re, &text, |_| {
            kinds.push((*kind).to_owned());
            Some(tag(kind))
        });
    }
    for (re, kind) in [(&c.bearer, "bearer_token"), (&c.basic, "basic_auth")] {
        text = replace_with(re, &text, |m| {
            if !random(&m[3]) {
                return None;
            }
            kinds.push(kind.to_owned());
            Some(join(&[&m[1], &m[2], &tag(kind)]))
        });
    }
    text = replace_with(&c.url_password, &text, |m| {
        if placeholder(&m[2]) {
            return None;
        }
        kinds.push("url_password".to_owned());
        Some(join(&[&m[1], &tag("url_password"), &m[3]]))
    });
    let subject = text.clone();
    text = replace_with(&c.pair, &subject, |m| {
        let (name, sep, mut value) = (&m[1], &m[2], &m[3]);
        let name_str = std::str::from_utf8(name).ok()?;
        let class = name_class(name_str)?;
        let end = m.get(0).expect("group 0").end();
        if subject.get(end) == Some(&b'(') {
            return None;
        }
        let mut trail = Vec::new();
        while value.last() == Some(&b'.') {
            trail.push(b'.');
            value = &value[..value.len() - 1];
        }
        let env_style = name_str.to_ascii_uppercase() == name_str;
        if !accept(class, env_style, value) {
            return None;
        }
        kinds.push("secret_assignment".to_owned());
        Some(join(&[name, sep, &tag("secret_assignment"), &trail]))
    });
    let mut out = String::from_utf8_lossy(&text).into_owned();
    if cut {
        out.push_str("[redacted:truncated]");
    }
    out
}
