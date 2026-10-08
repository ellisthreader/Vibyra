//! The matching lines of one file's text, as the results list shows them: a
//! window of the line around its first match, the matched character ranges,
//! and the same window with a replacement applied.

use serde::Serialize;

use super::matcher::Matcher;

pub(super) const WINDOW_CHARS: usize = 240;
const LEAD_CHARS: usize = 40;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchLine {
    /// 1-based.
    pub line: u32,
    /// A window of the line around its first match.
    pub text: String,
    /// Character ranges of the matches inside `text`.
    pub ranges: Vec<[u32; 2]>,
    /// The same window with the replacement applied, when one was given.
    pub after: Option<String>,
}

fn window(chars: &[char], from: usize, extra: usize) -> String {
    chars.iter().skip(from).take(WINDOW_CHARS + extra).collect()
}

/// The matching lines of `text`, stopping once `room` matches are collected.
pub(super) fn scan_text(
    matcher: &Matcher,
    replacement: Option<&str>,
    text: &str,
    room: usize,
) -> (Vec<SearchLine>, usize) {
    let (mut lines, mut count) = (Vec::new(), 0);
    for (index, raw) in text.split('\n').enumerate() {
        let raw = raw.strip_suffix('\r').unwrap_or(raw);
        let spans = matcher.find(raw);
        if spans.is_empty() {
            continue;
        }
        let take = spans.len().min(room - count);
        let chars: Vec<char> = raw.chars().collect();
        let first = raw[..spans[0].0].chars().count();
        let from = first.saturating_sub(LEAD_CHARS);
        let ranges = spans[..take]
            .iter()
            .map(|&(start, end)| {
                let a = raw[..start].chars().count();
                [a as u32, (a + raw[start..end].chars().count()) as u32]
            })
            .filter(|range| (range[0] as usize) < from + WINDOW_CHARS)
            .map(|range| {
                [
                    range[0] - from as u32,
                    range[1].min((from + WINDOW_CHARS) as u32) - from as u32,
                ]
            })
            .collect();
        let after = replacement.map(|with| {
            let (line, _) = matcher.replace_line(raw, with);
            let longer: Vec<char> = line.chars().collect();
            window(&longer, from, with.chars().count() * take)
        });
        lines.push(SearchLine {
            line: index as u32 + 1,
            text: window(&chars, from, 0),
            ranges,
            after,
        });
        count += take;
        if count >= room {
            break;
        }
    }
    (lines, count)
}
