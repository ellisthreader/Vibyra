//! The judgement calls behind `scan`: does a name read as a secret, and does a
//! value look like one. Mirrors `SecretValues.php`.

use super::patterns::{PLACEHOLDER_PARTS, PLACEHOLDER_WORDS, PREFIX, STRONG, WEAK};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum NameClass {
    Strong,
    Weak,
}

/// Strong (a secret by name), weak (`key` or `auth` on its own), or none.
pub(super) fn name_class(name: &str) -> Option<NameClass> {
    let words = words(name);
    let last = words.last()?;
    if STRONG.contains(&last.as_str()) {
        return Some(NameClass::Strong);
    }
    if !WEAK.contains(&last.as_str()) {
        return None;
    }
    let before = words.len().checked_sub(2).map(|i| words[i].as_str());
    Some(match before {
        Some(word) if PREFIX.contains(&word) => NameClass::Strong,
        _ => NameClass::Weak,
    })
}

/// Lowercase words split on `_ . -` and on a lower/digit to upper step
/// (`clientSecret` is client, secret).
pub(super) fn words(name: &str) -> Vec<String> {
    let bytes = name.as_bytes();
    let mut words = Vec::new();
    let mut start = 0;
    let mut previous = 0u8;
    for (i, &c) in bytes.iter().enumerate() {
        if matches!(c, b'_' | b'.' | b'-') {
            words.push(&name[start..i]);
            start = i + 1;
            previous = c;
            continue;
        }
        if c.is_ascii_uppercase()
            && i > start
            && (previous.is_ascii_lowercase() || previous.is_ascii_digit())
        {
            words.push(&name[start..i]);
            start = i;
        }
        previous = c;
    }
    words.push(&name[start..]);
    words
        .into_iter()
        .filter(|w| !w.is_empty())
        .map(|w| w.to_ascii_lowercase())
        .collect()
}

pub(super) fn accept(class: NameClass, env_style: bool, value: &[u8]) -> bool {
    if placeholder(value) {
        return false;
    }
    let n = value.len();
    let classes = classes(value);
    let entropy = entropy(value);
    match class {
        NameClass::Strong if env_style => n >= 8,
        NameClass::Strong => n >= 8 && (classes >= 2 || n >= 16) && entropy >= 2.5,
        NameClass::Weak if env_style => n >= 12 && classes >= 2 && entropy >= 3.0,
        NameClass::Weak => n >= 20 && classes >= 2 && entropy >= 3.5,
    }
}

pub(super) fn placeholder(value: &[u8]) -> bool {
    let lower = value.to_ascii_lowercase();
    if PLACEHOLDER_WORDS
        .iter()
        .any(|w| w.as_bytes() == lower.as_slice())
    {
        return true;
    }
    if matches!(value.first(), Some(b'$' | b'%' | b'*')) {
        return true;
    }
    if PLACEHOLDER_PARTS
        .iter()
        .any(|p| contains(&lower, p.as_bytes()))
    {
        return true;
    }
    value.iter().all(|b| Some(b) == value.first())
}

/// A bearer or basic token worth masking: long, and not a plain word.
pub(super) fn random(token: &[u8]) -> bool {
    token.len() >= 20 && classes(token) >= 2 && entropy(token) >= 3.0
}

/// How many of lower case, upper case and digits appear.
pub(super) fn classes(value: &[u8]) -> usize {
    [
        value.iter().any(u8::is_ascii_lowercase),
        value.iter().any(u8::is_ascii_uppercase),
        value.iter().any(u8::is_ascii_digit),
    ]
    .into_iter()
    .filter(|present| *present)
    .count()
}

/// Shannon entropy in bits per byte (PHP's `log($x, 2)` is `ln x / ln 2`).
pub(super) fn entropy(value: &[u8]) -> f64 {
    if value.is_empty() {
        return 0.0;
    }
    let mut counts = [0u32; 256];
    for &b in value {
        counts[b as usize] += 1;
    }
    let n = value.len() as f64;
    let mut sum = 0.0;
    for &count in counts.iter().filter(|c| **c > 0) {
        let p = count as f64 / n;
        sum -= p * (p.ln() / std::f64::consts::LN_2);
    }
    sum
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}
