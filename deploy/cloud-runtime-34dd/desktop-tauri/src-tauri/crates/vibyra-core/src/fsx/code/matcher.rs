//! The one line matcher search and replace share, so a replacement changes
//! exactly what the results showed. Literal text, never a pattern: optional
//! case folding and whole-word edges, one line at a time.

use serde::Deserialize;

use crate::{CoreError, CoreResult};

pub const MAX_QUERY_CHARS: usize = 500;
pub const MAX_REPLACEMENT_CHARS: usize = 5_000;
/// Longer lines (minified bundles) are not searched or replaced.
pub const MAX_LINE_BYTES: usize = 4_000;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub replacement: Option<String>,
}

pub struct Matcher {
    needle: Vec<char>,
    case_sensitive: bool,
    whole_word: bool,
}

fn refuse(message: &str) -> CoreError {
    CoreError::InvalidPath(message.into())
}

fn fold(c: char, case_sensitive: bool) -> char {
    if case_sensitive {
        c
    } else {
        c.to_lowercase().next().unwrap_or(c)
    }
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

impl Matcher {
    pub fn new(options: &SearchOptions) -> CoreResult<Self> {
        let query = &options.query;
        if query.is_empty() {
            return Err(refuse("Type something to search for."));
        }
        if query.chars().count() > MAX_QUERY_CHARS {
            return Err(refuse("That search is too long."));
        }
        if query.contains(['\n', '\r', '\0']) {
            return Err(refuse("Searches match one line at a time."));
        }
        if let Some(text) = &options.replacement {
            if text.chars().count() > MAX_REPLACEMENT_CHARS || text.contains('\0') {
                return Err(refuse("That replacement is not allowed."));
            }
        }
        Ok(Self {
            needle: query
                .chars()
                .map(|c| fold(c, options.case_sensitive))
                .collect(),
            case_sensitive: options.case_sensitive,
            whole_word: options.whole_word,
        })
    }

    /// Byte ranges of each non-overlapping match in `line` (no line ending).
    pub fn find(&self, line: &str) -> Vec<(usize, usize)> {
        let n = self.needle.len();
        let mut found = Vec::new();
        if line.len() > MAX_LINE_BYTES {
            return found;
        }
        let chars: Vec<(usize, char)> = line.char_indices().collect();
        let mut at = 0;
        while at + n <= chars.len() {
            let same = (0..n).all(|k| fold(chars[at + k].1, self.case_sensitive) == self.needle[k]);
            if same && self.edges_ok(&chars, at, n) {
                let end = chars.get(at + n).map_or(line.len(), |next| next.0);
                found.push((chars[at].0, end));
                at += n;
            } else {
                at += 1;
            }
        }
        found
    }

    fn edges_ok(&self, chars: &[(usize, char)], at: usize, n: usize) -> bool {
        if !self.whole_word {
            return true;
        }
        let before = at == 0 || !is_word(chars[at - 1].1);
        let after = chars.get(at + n).is_none_or(|next| !is_word(next.1));
        before && after
    }

    /// `line` with every match swapped for `with`, and how many were.
    pub fn replace_line(&self, line: &str, with: &str) -> (String, usize) {
        let found = self.find(line);
        if found.is_empty() {
            return (line.to_owned(), 0);
        }
        let mut out = String::with_capacity(line.len());
        let mut last = 0;
        for &(start, end) in &found {
            out.push_str(&line[last..start]);
            out.push_str(with);
            last = end;
        }
        out.push_str(&line[last..]);
        (out, found.len())
    }

    /// The whole text with each line replaced, every line ending kept as it was.
    pub fn replace_text(&self, text: &str, with: &str) -> (String, usize) {
        let mut out = String::with_capacity(text.len());
        let mut count = 0;
        for piece in text.split_inclusive('\n') {
            let body = piece.strip_suffix('\n').unwrap_or(piece);
            let body = body.strip_suffix('\r').unwrap_or(body);
            let (line, n) = self.replace_line(body, with);
            out.push_str(&line);
            out.push_str(&piece[body.len()..]);
            count += n;
        }
        (out, count)
    }
}

#[cfg(test)]
#[path = "matcher_tests.rs"]
mod tests;
