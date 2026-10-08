//! A tolerant `.env` reader that remembers exactly where each value sits, so an
//! edit rewrites one entry and leaves every comment, blank line, quote style
//! and line ending around it untouched.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quote {
    None,
    Single,
    Double,
}

/// One `KEY=value` entry. `first..=last` are indexes into the file's lines.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parsed {
    pub key: String,
    pub value: String,
    pub quote: Quote,
    pub exported: bool,
    pub indent: String,
    /// Everything after the value on its last line, e.g. `  # note`.
    pub suffix: String,
    pub first: usize,
    pub last: usize,
}

const MAX_SPAN: usize = 64;

pub fn valid_key(key: &str) -> bool {
    let mut chars = key.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && key.len() <= 128
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
}

/// The lines with their own terminators, so joining them reproduces the file.
pub fn split_lines(text: &str) -> Vec<&str> {
    text.split_inclusive('\n').collect()
}

pub fn content(line: &str) -> &str {
    line.trim_end_matches(['\n', '\r'])
}

fn decode_double(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('r') => out.push('\r'),
            Some('t') => out.push('\t'),
            Some(other) => out.push(other),
            None => out.push('\\'),
        }
    }
    out
}

/// The text up to the closing quote, starting inside `first_rest` and running
/// over following lines. Returns (inside, suffix, last line index).
fn quoted(
    lines: &[&str],
    index: usize,
    rest: &str,
    quote: char,
) -> Option<(String, String, usize)> {
    let mut inside = String::new();
    let mut text = rest.to_owned();
    for last in index..lines.len().min(index + MAX_SPAN) {
        let mut escaped = false;
        for (at, c) in text.char_indices() {
            if quote == '"' && c == '\\' && !escaped {
                escaped = true;
                continue;
            }
            if c == quote && !escaped {
                inside.push_str(&text[..at]);
                return Some((inside, text[at + 1..].to_owned(), last));
            }
            escaped = false;
        }
        inside.push_str(&text);
        // The newline inside the quotes belongs to the value; a CR does not.
        inside.push('\n');
        text = lines.get(last + 1).map(|l| content(l).to_owned())?;
    }
    None
}

pub fn parse(lines: &[&str]) -> Vec<Parsed> {
    let mut found = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let line = content(lines[index]);
        let body = line.trim_start();
        let indent = line[..line.len() - body.len()].to_owned();
        let Some(entry) = entry_at(lines, index, body, indent) else {
            index += 1;
            continue;
        };
        index = entry.last + 1;
        found.push(entry);
    }
    found
}

fn entry_at(lines: &[&str], index: usize, body: &str, indent: String) -> Option<Parsed> {
    if body.is_empty() || body.starts_with('#') {
        return None;
    }
    let (exported, body) = match body.strip_prefix("export") {
        Some(rest) if rest.starts_with([' ', '\t']) => (true, rest.trim_start()),
        _ => (false, body),
    };
    let (key, rest) = body.split_once('=')?;
    let key = key.trim_end();
    if !valid_key(key) {
        return None;
    }
    let rest = rest.trim_start();
    let (quote, value, suffix, last) = match rest.chars().next() {
        Some(q @ ('"' | '\'')) => {
            let (inside, suffix, last) = quoted(lines, index, &rest[1..], q)?;
            if q == '"' {
                (Quote::Double, decode_double(&inside), suffix, last)
            } else {
                (Quote::Single, inside, suffix, last)
            }
        }
        _ => {
            let cut = rest
                .find(" #")
                .or_else(|| rest.find("\t#"))
                .unwrap_or(rest.len());
            let value = rest[..cut].trim_end();
            (
                Quote::None,
                value.to_owned(),
                rest[value.len()..].to_owned(),
                index,
            )
        }
    };
    Some(Parsed {
        key: key.to_owned(),
        value,
        quote,
        exported,
        indent,
        suffix,
        first: index,
        last,
    })
}

/// The value as it is written back: bare when that is unambiguous, otherwise quoted.
pub fn encode(value: &str, prefer: Quote) -> String {
    let bare = !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "_@%+=:,./-".contains(c));
    if value.is_empty() || bare {
        return value.to_owned();
    }
    if prefer == Quote::Single && !value.contains(['\'', '\n', '\r']) {
        return format!("'{value}'");
    }
    let escaped = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r");
    format!("\"{escaped}\"")
}

#[cfg(test)]
#[path = "parse_tests.rs"]
mod tests;
